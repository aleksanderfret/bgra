"""Stream a grounded answer from retrieved passages, token by token."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from rag_engine.contract import (
    AskRequest,
    DoneEvent,
    ErrorEvent,
    Groundedness,
    NoticeEvent,
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
from rag_engine.retrieval.pipeline import player_facing_hits, retrieve
from rag_engine.retrieval.prompt import build_messages
from rag_engine.retrieval.service import RetrievalStack
from rag_engine.retrieval.sources import to_retrieved_source
from rag_engine.retrieval.think import should_think
from rag_engine.settings import Settings, get_settings
from rag_engine.speech import (
    SpeechExtraMissingError,
    WavValidationError,
    parse_app_locale,
    transcribe_wav_bytes,
)
from rag_engine.speech.stream_speak import speak_alongside_tokens
from rag_engine.sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_comment, encode_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assistant"])


def _stack_from(http_request: Request) -> RetrievalStack | None:
    return getattr(http_request.app.state, "retrieval_stack", None)


def _retrieval_loading(http_request: Request) -> bool:
    return bool(getattr(http_request.app.state, "retrieval_loading", False))


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


async def _stream_answer(
    payload: AskRequest,
    settings: Settings,
    http_request: Request,
    *,
    audio_wav: bytes | None = None,
) -> AsyncIterator[str]:
    locale = parse_app_locale(payload.locale)
    question = payload.question

    if audio_wav is not None:
        yield encode_event(StatusEvent(stage="transcribing"))
        try:
            question = await asyncio.to_thread(
                transcribe_wav_bytes,
                audio_wav,
                profile_stt=settings.profile.stt,
                language=locale,
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
            logger.exception("STT failed")
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

    yield encode_event(StatusEvent(stage="retrieving"))

    stack = _stack_from(http_request)
    if stack is None:
        notice = "retrieval_loading" if _retrieval_loading(http_request) else "retrieval_not_ready"
        yield encode_event(NoticeEvent(code=notice, params={}))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    try:
        tags = await installed_ollama_tags(settings.ollama_url)
    except OllamaUnreachableError:
        yield encode_event(ErrorEvent(code="engine_unreachable", message="Cannot reach Ollama."))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    missing = [tag for tag in (settings.profile.llm, settings.profile.embedding) if tag not in tags]
    if missing:
        yield encode_event(
            ErrorEvent(
                code="model_missing",
                message=f"Missing Ollama models: {', '.join(missing)}.",
            )
        )
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    if await http_request.is_disconnected():
        return

    game_ids = active_game_ids(payload.game_id, payload.expansion_ids)
    index = stack.open_index(settings.storage_dir)
    if index.count_for_games(game_ids) == 0:
        if active_set_has_chunks(settings.storage_dir, game_ids):
            code = "search_catch_up_needed"
            params: dict[str, str] = {"gameId": payload.game_id}
        else:
            code = "engine_not_indexed"
            params = {"gameId": payload.game_id, "profile": settings.model_profile}
        yield encode_event(NoticeEvent(code=code, params=params))
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    generation_failed = False
    await generation_semaphore.acquire()
    warm_task: asyncio.Task[None] | None = None
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
            return

        yield encode_event(
            SourcesEvent(sources=[to_retrieved_source(hit) for hit in player_facing_hits(hits)])
        )
        yield encode_comment("sources")
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
            yield encode_event(NoticeEvent(code="preparing_assistant", params={}))
            yield encode_comment("preparing")
        await warm_task
        if think:
            yield encode_event(NoticeEvent(code="checking_sources_carefully", params={}))
        yield encode_event(StatusEvent(stage="generating"))
        yield encode_comment("generating")
        messages = build_messages(question, hits)

        async def token_stream() -> AsyncIterator[str]:
            async for text in generate_stream(
                settings.ollama_url,
                settings.profile.llm,
                messages,
                context_tokens=settings.profile.context_tokens,
                think=think,
            ):
                yield text

        async for frame in speak_alongside_tokens(
            token_stream(),
            speak=payload.speak,
            storage_dir=settings.storage_dir,
            locale=locale,
            is_disconnected=http_request.is_disconnected,
        ):
            yield frame
    except GenerationTimeoutError:
        generation_failed = True
        logger.warning("Generation timed out for model %s", settings.profile.llm)
        yield encode_event(
            ErrorEvent(code="generation_timeout", message="Model stopped producing tokens.")
        )
    except ModelNotInstalledError:
        generation_failed = True
        yield encode_event(
            ErrorEvent(
                code="model_missing",
                message=f"Model {settings.profile.llm} disappeared during generation.",
            )
        )
    except OllamaUnreachableError:
        generation_failed = True
        yield encode_event(
            ErrorEvent(
                code="engine_unreachable",
                message="Lost connection to Ollama during generation.",
            )
        )
    finally:
        if warm_task is not None and not warm_task.done():
            warm_task.cancel()
            with suppress(asyncio.CancelledError):
                await warm_task
        generation_semaphore.release()

    groundedness: Groundedness = "insufficient_evidence" if generation_failed else "grounded"
    yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness=groundedness))


@router.post("/ask", response_model=None)
async def ask(
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
        game_id = str(form.get("gameId") or "")
        mode_raw = str(form.get("mode") or "arbitrate")
        speak = _parse_bool(str(form.get("speak")) if form.get("speak") is not None else None)
        locale = str(form.get("locale") or "en")
        expansion_raw = form.get("expansionIds")
        expansion_ids: list[str] = []
        if isinstance(expansion_raw, str) and expansion_raw.strip():
            try:
                parsed = json.loads(expansion_raw)
            except json.JSONDecodeError:
                return JSONResponse(
                    status_code=400,
                    content={
                        "type": "error",
                        "code": "invalid_expansion_ids",
                        "message": "expansionIds must be a JSON array string.",
                    },
                )
            if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
                return JSONResponse(
                    status_code=400,
                    content={
                        "type": "error",
                        "code": "invalid_expansion_ids",
                        "message": "expansionIds must be a JSON array of strings.",
                    },
                )
            expansion_ids = parsed

        upload = form.get("audio")
        question_field = form.get("question")
        question = str(question_field) if isinstance(question_field, str) else ""

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

        mode: Literal["teach", "arbitrate"] = "arbitrate"
        if mode_raw == "teach":
            mode = "teach"

        try:
            payload = AskRequest(
                game_id=game_id,
                question=question.strip() or ".",
                mode=mode,
                expansion_ids=expansion_ids,
                speak=speak,
                locale=locale,
            )
        except ValidationError as error:
            return JSONResponse(status_code=422, content={"detail": error.errors()})
    else:
        body = await http_request.json()
        try:
            payload = AskRequest.model_validate(body)
        except ValidationError as error:
            return JSONResponse(status_code=422, content={"detail": error.errors()})

    try:
        validate_expansion_ids(settings.storage_dir, payload.game_id, payload.expansion_ids)
    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "type": "error",
                "code": "invalid_expansion_ids",
                "message": str(error),
            },
        )
    return StreamingResponse(
        _stream_answer(payload, settings, http_request, audio_wav=audio_wav),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
