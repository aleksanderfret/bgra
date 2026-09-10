"""Learn mode: plan a syllabus, then stream one teaching unit at a time."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from rag_engine.contract import (
    DoneEvent,
    ErrorEvent,
    Groundedness,
    LessonActiveResponse,
    LessonAskRequest,
    LessonSession,
    LessonSessionRequest,
    LessonStartRequest,
    LessonSyllabusUnit,
    LessonTurn,
    LessonTurnKind,
    NoticeEvent,
    RetrievedSource,
    SourcesEvent,
    StatusEvent,
    TranscriptEvent,
)
from rag_engine.engines.embed import OllamaEmbedder
from rag_engine.engines.generation_lock import generation_semaphore
from rag_engine.engines.llm import (
    GenerationTimeoutError,
    ModelNotInstalledError,
    OllamaUnreachableError,
    generate_stream,
    installed_ollama_tags,
    load_model,
)
from rag_engine.ingest.pipeline import active_set_has_chunks
from rag_engine.ingest.registry import active_game_ids, validate_expansion_ids
from rag_engine.lesson.archive import append_turn as archive_append_turn
from rag_engine.lesson.archive import load_style_exemplars
from rag_engine.lesson.generate import (
    chunks_for_unit,
    hits_for_unit,
    records_to_retrieved,
)
from rag_engine.lesson.prompts import build_digression_messages, build_teach_messages
from rag_engine.lesson.session_store import (
    create_session,
    get_active_for_game,
    load_session,
    save_session,
    touch_session,
)
from rag_engine.lesson.syllabus import LessonPlanError, build_syllabus
from rag_engine.retrieval.pipeline import player_facing_hits, retrieve
from rag_engine.retrieval.service import RetrievalStack
from rag_engine.retrieval.sources import to_retrieved_source
from rag_engine.retrieval.think import should_think
from rag_engine.retrieval.types import RetrievedChunk
from rag_engine.settings import Settings, get_settings
from rag_engine.speech import (
    SpeechExtraMissingError,
    WavValidationError,
    transcribe_wav_bytes,
)
from rag_engine.sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_comment, encode_event
from rag_engine.storage_paths import (
    InvalidGameIdError,
    InvalidSessionIdError,
    assert_game_id,
    assert_session_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["lesson"])

#: Session ids currently streaming a Learn generation.
_generating_sessions: set[str] = set()

_ACTIVE_STATUSES = frozenset({"active", "paused"})
_TERMINAL_STATUSES = frozenset({"completed", "expired"})


def _stack_from(http_request: Request) -> RetrievalStack | None:
    return getattr(http_request.app.state, "retrieval_stack", None)


def _retrieval_loading(http_request: Request) -> bool:
    return bool(getattr(http_request.app.state, "retrieval_loading", False))


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _invalid_expansions_response(error: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "type": "error",
            "code": "invalid_expansion_ids",
            "message": str(error),
        },
    )


def _save(storage_dir: Path, session: LessonSession) -> LessonSession:
    updated = touch_session(session)
    save_session(storage_dir, updated)
    return updated


def _append_turn(
    storage_dir: Path,
    session: LessonSession,
    *,
    kind: LessonTurnKind,
    unit_id: str | None,
    question: str | None,
    text: str,
    sources: list[RetrievedSource],
    groundedness: Groundedness,
) -> LessonSession:
    turn = LessonTurn(
        id=uuid4().hex,
        kind=kind,
        unit_id=unit_id,
        question=question,
        text=text,
        sources=sources,
        groundedness=groundedness,
    )
    archive_append_turn(storage_dir, session.game_id, turn)
    return session.model_copy(update={"turns": [*session.turns, turn]})


async def _model_preflight(settings: Settings) -> list[str] | None:
    """Return SSE frames that end the stream early, or None when models are ready."""
    try:
        tags = await installed_ollama_tags(settings.ollama_url)
    except OllamaUnreachableError:
        return [
            encode_event(ErrorEvent(code="engine_unreachable", message="Cannot reach Ollama.")),
            encode_event(SourcesEvent(sources=[])),
            encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")),
        ]

    missing = [tag for tag in (settings.profile.llm, settings.profile.embedding) if tag not in tags]
    if missing:
        return [
            encode_event(
                ErrorEvent(
                    code="model_missing",
                    message=f"Missing Ollama models: {', '.join(missing)}.",
                )
            ),
            encode_event(SourcesEvent(sources=[])),
            encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")),
        ]
    return None


async def _stream_llm(
    *,
    http_request: Request,
    settings: Settings,
    hits: list[RetrievedChunk],
    messages: list[dict[str, str]],
    token_parts: list[str],
    speak: bool = False,
    locale: str = "en",
) -> AsyncIterator[tuple[str, Groundedness | None]]:
    """Yield (sse_frame, done_groundedness_or_None). Done frame carries groundedness."""
    from rag_engine.speech import parse_app_locale
    from rag_engine.speech.stream_speak import speak_alongside_tokens

    generation_failed = False
    warm_task: asyncio.Task[None] | None = None
    try:
        sources = [to_retrieved_source(hit) for hit in player_facing_hits(hits)]
        yield encode_event(SourcesEvent(sources=sources)), None
        yield encode_comment("sources"), None
        if await http_request.is_disconnected():
            return

        think = settings.profile.llm_thinks and should_think(
            hits, settings.min_relevance_score, settings.profile.context_tokens
        )
        warm_task = asyncio.create_task(
            load_model(
                settings.ollama_url,
                settings.profile.llm,
                context_tokens=settings.profile.context_tokens,
            )
        )
        try:
            await asyncio.wait_for(asyncio.shield(warm_task), timeout=0.2)
        except TimeoutError:
            yield encode_event(NoticeEvent(code="preparing_assistant", params={})), None
            yield encode_comment("preparing"), None
        await warm_task
        if think:
            yield encode_event(NoticeEvent(code="checking_sources_carefully", params={})), None
        yield encode_event(StatusEvent(stage="generating")), None
        yield encode_comment("generating"), None

        async def token_stream() -> AsyncIterator[str]:
            async for text in generate_stream(
                settings.ollama_url,
                settings.profile.llm,
                messages,
                context_tokens=settings.profile.context_tokens,
                think=think,
            ):
                token_parts.append(text)
                yield text

        async for frame in speak_alongside_tokens(
            token_stream(),
            speak=speak,
            storage_dir=settings.storage_dir,
            locale=parse_app_locale(locale),
            is_disconnected=http_request.is_disconnected,
        ):
            if await http_request.is_disconnected():
                return
            yield frame, None
    except GenerationTimeoutError:
        generation_failed = True
        logger.warning("Lesson generation timed out for model %s", settings.profile.llm)
        yield (
            encode_event(
                ErrorEvent(code="generation_timeout", message="Model stopped producing tokens.")
            ),
            None,
        )
    except ModelNotInstalledError:
        generation_failed = True
        yield (
            encode_event(
                ErrorEvent(
                    code="model_missing",
                    message=f"Model {settings.profile.llm} disappeared during generation.",
                )
            ),
            None,
        )
    except OllamaUnreachableError:
        generation_failed = True
        yield (
            encode_event(
                ErrorEvent(
                    code="engine_unreachable",
                    message="Lost connection to Ollama during generation.",
                )
            ),
            None,
        )
    finally:
        if warm_task is not None and not warm_task.done():
            warm_task.cancel()
            with suppress(asyncio.CancelledError):
                await warm_task

    groundedness: Groundedness = "insufficient_evidence" if generation_failed else "grounded"
    yield (
        encode_event(DoneEvent(answer_id=uuid4().hex, groundedness=groundedness)),
        groundedness,
    )


def _unit_sources(hits: list[RetrievedChunk]) -> list[RetrievedSource]:
    return [to_retrieved_source(hit) for hit in player_facing_hits(hits)]


def _unit_has_turn(session: LessonSession, unit_index: int) -> bool:
    """True when this syllabus slot already has a unit turn (taught or insufficient)."""
    if unit_index < 0 or unit_index >= len(session.syllabus):
        return False
    unit_id = session.syllabus[unit_index].unit_id
    return any(turn.kind == "unit" and turn.unit_id == unit_id for turn in session.turns)


def _next_unit_index(session: LessonSession) -> int:
    """Re-teach the current slot when start/abort never wrote a unit turn."""
    if not _unit_has_turn(session, session.unit_index):
        return session.unit_index
    return session.unit_index + 1


def _insufficient_unit_end(
    session: LessonSession,
    *,
    storage_dir: Path,
    unit: LessonSyllabusUnit,
    unit_index: int,
    kind: Literal["unit"],
) -> LessonSession:
    session = _append_turn(
        storage_dir,
        session,
        kind=kind,
        unit_id=unit.unit_id,
        question=None,
        text="",
        sources=[],
        groundedness="insufficient_evidence",
    )
    return _save(
        storage_dir,
        session.model_copy(update={"unit_index": unit_index, "status": "active"}),
    )


async def _stream_unit(
    *,
    http_request: Request,
    settings: Settings,
    session: LessonSession,
    unit_index: int,
    kind: Literal["unit"],
    speak: bool = False,
    locale: str = "en",
) -> AsyncIterator[str]:
    storage_dir = settings.storage_dir
    unit = session.syllabus[unit_index]
    game_ids = active_game_ids(session.game_id, session.expansion_ids)

    preflight = await _model_preflight(settings)
    if preflight is not None:
        for frame in preflight:
            yield frame
        return

    if await http_request.is_disconnected():
        return

    yield encode_event(StatusEvent(stage="retrieving"))

    await generation_semaphore.acquire()
    try:
        if await http_request.is_disconnected():
            return

        disk = chunks_for_unit(storage_dir, unit, game_ids)
        hits: list[RetrievedChunk]
        if disk:
            hits = records_to_retrieved(disk)
        else:
            stack = _stack_from(http_request)
            if stack is None:
                notice = (
                    "retrieval_loading"
                    if _retrieval_loading(http_request)
                    else "retrieval_not_ready"
                )
                yield encode_event(NoticeEvent(code=notice, params={}))
                yield encode_event(SourcesEvent(sources=[]))
                yield encode_event(
                    DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
                )
                _insufficient_unit_end(
                    session,
                    storage_dir=storage_dir,
                    unit=unit,
                    unit_index=unit_index,
                    kind=kind,
                )
                return

            index = stack.open_index(settings.storage_dir)
            if index.count_for_games(game_ids) == 0:
                if active_set_has_chunks(storage_dir, game_ids):
                    code = "search_catch_up_needed"
                    params: dict[str, str] = {"gameId": session.game_id}
                else:
                    code = "engine_not_indexed"
                    params = {"gameId": session.game_id, "profile": settings.model_profile}
                yield encode_event(NoticeEvent(code=code, params=params))
                yield encode_event(SourcesEvent(sources=[]))
                yield encode_event(
                    DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
                )
                _insufficient_unit_end(
                    session,
                    storage_dir=storage_dir,
                    unit=unit,
                    unit_index=unit_index,
                    kind=kind,
                )
                return

            hits = await hits_for_unit(
                storage_dir=storage_dir,
                unit=unit,
                game_ids=game_ids,
                embedder=OllamaEmbedder(settings.ollama_url, settings.profile.embedding),
                index=index,
                reranker=stack.reranker,
                candidates=settings.retrieval_candidates,
                top_k=settings.retrieval_top_k,
                min_relevance_score=settings.min_relevance_score,
                relevance_share_of_best=settings.relevance_share_of_best,
            )

        if not hits:
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            _insufficient_unit_end(
                session,
                storage_dir=storage_dir,
                unit=unit,
                unit_index=unit_index,
                kind=kind,
            )
            return

        covered = [entry.title for entry in session.syllabus[:unit_index]]
        language_hint = unit.title or session.game_id
        style = load_style_exemplars(storage_dir, session.game_id)
        messages = build_teach_messages(
            unit.title,
            covered,
            hits,
            language_hint,
            style_exemplars=style,
        )
        token_parts: list[str] = []
        groundedness: Groundedness = "insufficient_evidence"
        got_done = False

        if await http_request.is_disconnected():
            return
        async for frame, done_g in _stream_llm(
            http_request=http_request,
            settings=settings,
            hits=hits,
            messages=messages,
            token_parts=token_parts,
            speak=speak,
            locale=locale,
        ):
            yield frame
            if done_g is not None:
                groundedness = done_g
                got_done = True

        # Client left mid-stream: do not persist a partial unit or advance the cursor.
        if not got_done or await http_request.is_disconnected():
            return

        session = _append_turn(
            storage_dir,
            session,
            kind=kind,
            unit_id=unit.unit_id,
            question=None,
            text="".join(token_parts),
            sources=_unit_sources(hits),
            groundedness=groundedness,
        )
        _save(
            storage_dir,
            session.model_copy(update={"unit_index": unit_index, "status": "active"}),
        )
    finally:
        generation_semaphore.release()


async def _stream_digression(
    *,
    http_request: Request,
    settings: Settings,
    session: LessonSession,
    question: str,
    speak: bool = False,
    locale: str = "en",
) -> AsyncIterator[str]:
    storage_dir = settings.storage_dir
    game_ids = active_game_ids(session.game_id, session.expansion_ids)
    unit: LessonSyllabusUnit | None = None
    if 0 <= session.unit_index < len(session.syllabus):
        unit = session.syllabus[session.unit_index]

    session = _save(storage_dir, session.model_copy(update={"status": "paused"}))

    stack = _stack_from(http_request)
    if stack is None:
        notice = "retrieval_loading" if _retrieval_loading(http_request) else "retrieval_not_ready"
        yield encode_event(NoticeEvent(code=notice, params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        session = _append_turn(
            storage_dir,
            session,
            kind="digression",
            unit_id=unit.unit_id if unit else None,
            question=question,
            text="",
            sources=[],
            groundedness="insufficient_evidence",
        )
        _save(storage_dir, session.model_copy(update={"status": "active"}))
        return

    preflight = await _model_preflight(settings)
    if preflight is not None:
        for frame in preflight:
            yield frame
        _save(storage_dir, session.model_copy(update={"status": "active"}))
        return

    if await http_request.is_disconnected():
        _save(storage_dir, session.model_copy(update={"status": "active"}))
        return

    yield encode_event(StatusEvent(stage="retrieving"))
    index = stack.open_index(settings.storage_dir)

    if index.count_for_games(game_ids) == 0:
        if active_set_has_chunks(storage_dir, game_ids):
            code = "search_catch_up_needed"
            params: dict[str, str] = {"gameId": session.game_id}
        else:
            code = "engine_not_indexed"
            params = {"gameId": session.game_id, "profile": settings.model_profile}
        yield encode_event(NoticeEvent(code=code, params=params))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        session = _append_turn(
            storage_dir,
            session,
            kind="digression",
            unit_id=unit.unit_id if unit else None,
            question=question,
            text="",
            sources=[],
            groundedness="insufficient_evidence",
        )
        _save(storage_dir, session.model_copy(update={"status": "active"}))
        return

    await generation_semaphore.acquire()
    token_parts: list[str] = []
    groundedness: Groundedness = "insufficient_evidence"
    hits: list[RetrievedChunk] = []
    outcome: Literal["done", "handled", "abort"] = "abort"
    try:
        if await http_request.is_disconnected():
            return
        yield encode_event(StatusEvent(stage="reranking"))
        hits = await retrieve(
            question=question,
            game_ids=game_ids,
            embedder=OllamaEmbedder(settings.ollama_url, settings.profile.embedding),
            index=index,
            reranker=stack.reranker,
            candidates=settings.retrieval_candidates,
            top_k=settings.retrieval_top_k,
            min_relevance_score=settings.min_relevance_score,
            relevance_share_of_best=settings.relevance_share_of_best,
        )
        if not hits:
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            session = _append_turn(
                storage_dir,
                session,
                kind="digression",
                unit_id=unit.unit_id if unit else None,
                question=question,
                text="",
                sources=[],
                groundedness="insufficient_evidence",
            )
            _save(storage_dir, session.model_copy(update={"status": "active"}))
            outcome = "handled"
            return

        messages = build_digression_messages(question, hits)
        got_done = False
        async for frame, done_g in _stream_llm(
            http_request=http_request,
            settings=settings,
            hits=hits,
            messages=messages,
            token_parts=token_parts,
            speak=speak,
            locale=locale,
        ):
            yield frame
            if done_g is not None:
                groundedness = done_g
                got_done = True
        if got_done and not await http_request.is_disconnected():
            outcome = "done"
    finally:
        generation_semaphore.release()
        if outcome == "abort":
            _save(storage_dir, session.model_copy(update={"status": "active"}))

    if outcome != "done":
        return

    session = _append_turn(
        storage_dir,
        session,
        kind="digression",
        unit_id=unit.unit_id if unit else None,
        question=question,
        text="".join(token_parts),
        sources=_unit_sources(hits),
        groundedness=groundedness,
    )
    _save(storage_dir, session.model_copy(update={"status": "active"}))


def _parse_expires_at(value: str) -> datetime:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    return datetime.fromisoformat(cleaned).astimezone(UTC)


def _load_usable_session(
    storage_dir: Path,
    session_id: str,
) -> tuple[LessonSession | None, str | None]:
    """Return (session, notice_code). notice_code set when the session cannot continue."""
    try:
        assert_session_id(session_id)
    except InvalidSessionIdError:
        return None, "lesson_expired"

    session = load_session(storage_dir, session_id)
    if session is None:
        return None, "lesson_expired"

    if session.status in _TERMINAL_STATUSES or session.status == "planning":
        return None, "lesson_expired"

    if datetime.now(UTC) >= _parse_expires_at(session.expires_at):
        expired = session.model_copy(update={"status": "expired"})
        save_session(storage_dir, expired)
        return None, "lesson_expired"

    if session.session_id in _generating_sessions:
        return session, "lesson_busy"

    if session.status not in _ACTIVE_STATUSES:
        return None, "lesson_expired"

    return session, None


async def _stream_start(
    payload: LessonStartRequest,
    settings: Settings,
    http_request: Request,
) -> AsyncIterator[str]:
    storage_dir = settings.storage_dir
    session = create_session(storage_dir, payload.game_id, payload.expansion_ids)
    _generating_sessions.add(session.session_id)
    try:
        yield encode_event(StatusEvent(stage="planning"))

        game_ids = active_game_ids(payload.game_id, payload.expansion_ids)
        try:
            syllabus = await asyncio.to_thread(build_syllabus, storage_dir, game_ids)
        except LessonPlanError:
            yield encode_event(NoticeEvent(code="lesson_plan_failed", params={}))
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            session = session.model_copy(update={"status": "completed", "syllabus": []})
            _save(storage_dir, session)
            return

        session = session.model_copy(
            update={
                "syllabus": syllabus,
                "unit_index": 0,
                "status": "active",
            }
        )
        session = _save(storage_dir, session)

        if await http_request.is_disconnected():
            return

        async for frame in _stream_unit(
            http_request=http_request,
            settings=settings,
            session=session,
            unit_index=0,
            kind="unit",
            speak=payload.speak,
            locale=payload.locale,
        ):
            yield frame
    finally:
        _generating_sessions.discard(session.session_id)


async def _stream_continue(
    payload: LessonSessionRequest,
    settings: Settings,
    http_request: Request,
) -> AsyncIterator[str]:
    session, notice = _load_usable_session(settings.storage_dir, payload.session_id)
    if notice == "lesson_busy" and session is not None:
        yield encode_event(NoticeEvent(code="lesson_busy", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return
    if session is None or notice is not None:
        yield encode_event(NoticeEvent(code=notice or "lesson_expired", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    next_index = _next_unit_index(session)
    if next_index >= len(session.syllabus):
        session = _save(
            settings.storage_dir,
            session.model_copy(update={"status": "completed"}),
        )
        yield encode_event(NoticeEvent(code="lesson_complete", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="grounded"))
        return

    _generating_sessions.add(session.session_id)
    try:
        async for frame in _stream_unit(
            http_request=http_request,
            settings=settings,
            session=session,
            unit_index=next_index,
            kind="unit",
            speak=payload.speak,
            locale=payload.locale,
        ):
            yield frame
    finally:
        _generating_sessions.discard(session.session_id)


async def _stream_repeat(
    payload: LessonSessionRequest,
    settings: Settings,
    http_request: Request,
) -> AsyncIterator[str]:
    session, notice = _load_usable_session(settings.storage_dir, payload.session_id)
    if notice == "lesson_busy" and session is not None:
        yield encode_event(NoticeEvent(code="lesson_busy", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return
    if session is None or notice is not None:
        yield encode_event(NoticeEvent(code=notice or "lesson_expired", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    if not session.syllabus or session.unit_index >= len(session.syllabus):
        yield encode_event(NoticeEvent(code="lesson_expired", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    _generating_sessions.add(session.session_id)
    try:
        async for frame in _stream_unit(
            http_request=http_request,
            settings=settings,
            session=session,
            unit_index=session.unit_index,
            kind="unit",
            speak=payload.speak,
            locale=payload.locale,
        ):
            yield frame
    finally:
        _generating_sessions.discard(session.session_id)


async def _stream_ask(
    payload: LessonAskRequest,
    settings: Settings,
    http_request: Request,
    *,
    audio_wav: bytes | None = None,
) -> AsyncIterator[str]:
    session, notice = _load_usable_session(settings.storage_dir, payload.session_id)
    if notice == "lesson_busy" and session is not None:
        yield encode_event(NoticeEvent(code="lesson_busy", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return
    if session is None or notice is not None:
        yield encode_event(NoticeEvent(code=notice or "lesson_expired", params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    question = payload.question
    if audio_wav is not None:
        yield encode_event(StatusEvent(stage="transcribing"))
        try:
            from rag_engine.speech import parse_app_locale

            question = await asyncio.to_thread(
                transcribe_wav_bytes,
                audio_wav,
                profile_stt=settings.profile.stt,
                language=parse_app_locale(payload.locale),
            )
        except WavValidationError:
            yield encode_event(NoticeEvent(code="speech_invalid_audio", params={}))
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            return
        except SpeechExtraMissingError:
            yield encode_event(
                ErrorEvent(code="speech_unavailable", message="Speech extra is not installed.")
            )
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            return
        except Exception:
            logger.exception("Lesson digression STT failed")
            yield encode_event(
                ErrorEvent(code="speech_failed", message="Speech recognition failed.")
            )
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            return

        yield encode_event(TranscriptEvent(text=question))
        if not question.strip():
            yield encode_event(NoticeEvent(code="speech_empty", params={}))
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            return

    _generating_sessions.add(session.session_id)
    try:
        async for frame in _stream_digression(
            http_request=http_request,
            settings=settings,
            session=session,
            question=question,
            speak=payload.speak,
            locale=payload.locale,
        ):
            yield frame
    finally:
        _generating_sessions.discard(session.session_id)


@router.post("/lesson/start", response_model=None)
async def lesson_start(
    payload: LessonStartRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse | JSONResponse:
    try:
        validate_expansion_ids(settings.storage_dir, payload.game_id, payload.expansion_ids)
    except ValueError as error:
        return _invalid_expansions_response(error)
    return StreamingResponse(
        _stream_start(payload, settings, http_request),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )


@router.post("/lesson/continue", response_model=None)
async def lesson_continue(
    payload: LessonSessionRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    return StreamingResponse(
        _stream_continue(payload, settings, http_request),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )


@router.post("/lesson/repeat", response_model=None)
async def lesson_repeat(
    payload: LessonSessionRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    return StreamingResponse(
        _stream_repeat(payload, settings, http_request),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )


@router.post("/lesson/ask", response_model=None)
async def lesson_ask(
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse | JSONResponse:
    content_type = (http_request.headers.get("content-type") or "").lower()
    audio_wav: bytes | None = None

    if "multipart/form-data" in content_type:
        from rag_engine.speech.wav import MAX_WAV_BYTES

        try:
            form = await http_request.form(max_part_size=MAX_WAV_BYTES)
        except Exception:
            return JSONResponse(
                status_code=400,
                content={
                    "type": "error",
                    "code": "speech_invalid_audio",
                    "message": "Audio upload exceeds the allowed size.",
                },
            )
        session_id = str(form.get("sessionId") or "")
        speak = _parse_bool(str(form.get("speak")) if form.get("speak") is not None else None)
        locale = str(form.get("locale") or "en")
        question_field = form.get("question")
        question = str(question_field) if isinstance(question_field, str) else ""
        upload = form.get("audio")
        if hasattr(upload, "read"):
            audio_wav = await upload.read()  # type: ignore[union-attr]
            if not audio_wav:
                audio_wav = None
        if audio_wav is None and not question.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "type": "error",
                    "code": "missing_question",
                    "message": "Provide question text or an audio WAV upload.",
                },
            )
        try:
            payload = LessonAskRequest(
                session_id=session_id,
                question=question.strip() or ".",
                speak=speak,
                locale=locale,
            )
        except ValidationError as error:
            return JSONResponse(status_code=422, content={"detail": error.errors()})
    else:
        body = await http_request.json()
        try:
            payload = LessonAskRequest.model_validate(body)
        except ValidationError as error:
            return JSONResponse(status_code=422, content={"detail": error.errors()})

    return StreamingResponse(
        _stream_ask(payload, settings, http_request, audio_wav=audio_wav),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )


@router.get("/lesson/active", response_model=LessonActiveResponse)
async def lesson_active(
    settings: Annotated[Settings, Depends(get_settings)],
    game_id: Annotated[str, Query(alias="gameId")],
) -> LessonActiveResponse | JSONResponse:
    try:
        assert_game_id(game_id)
    except InvalidGameIdError as error:
        return JSONResponse(
            status_code=400,
            content={
                "type": "error",
                "code": "invalid_game_id",
                "message": str(error),
            },
        )
    session = get_active_for_game(settings.storage_dir, game_id)
    return LessonActiveResponse(session=session)
