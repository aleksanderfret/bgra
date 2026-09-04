"""Stream a grounded answer from retrieved passages, token by token."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from rag_engine.contract import (
    AskRequest,
    DoneEvent,
    ErrorEvent,
    Groundedness,
    NoticeEvent,
    SourcesEvent,
    StatusEvent,
    TokenEvent,
)
from rag_engine.engines.embed import OllamaEmbedder
from rag_engine.engines.llm import (
    GenerationTimeoutError,
    ModelNotInstalledError,
    OllamaUnreachableError,
    generate_stream,
    installed_ollama_tags,
)
from rag_engine.ingest.registry import active_game_ids, validate_expansion_ids
from rag_engine.retrieval.pipeline import retrieve
from rag_engine.retrieval.prompt import build_messages
from rag_engine.retrieval.service import RetrievalStack
from rag_engine.retrieval.sources import to_retrieved_source
from rag_engine.settings import Settings, get_settings
from rag_engine.sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assistant"])

_generation_semaphore = asyncio.Semaphore(1)


def _stack_from(http_request: Request) -> RetrievalStack | None:
    return getattr(http_request.app.state, "retrieval_stack", None)


def _retrieval_loading(http_request: Request) -> bool:
    return bool(getattr(http_request.app.state, "retrieval_loading", False))


async def _stream_answer(
    payload: AskRequest,
    settings: Settings,
    http_request: Request,
) -> AsyncIterator[str]:
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
        yield encode_event(
            NoticeEvent(
                code="engine_not_indexed",
                params={"gameId": payload.game_id, "profile": settings.model_profile},
            )
        )
        yield encode_event(SourcesEvent(sources=[]))
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    generation_failed = False
    await _generation_semaphore.acquire()
    try:
        if await http_request.is_disconnected():
            return
        yield encode_event(StatusEvent(stage="reranking"))
        hits = await retrieve(
            question=payload.question,
            game_ids=game_ids,
            embedder=OllamaEmbedder(settings.ollama_url, settings.profile.embedding),
            index=index,
            reranker=stack.reranker,
            candidates=settings.retrieval_candidates,
            top_k=settings.retrieval_top_k,
            min_relevance_score=settings.min_relevance_score,
        )
        if not hits:
            yield encode_event(SourcesEvent(sources=[]))
            yield encode_event(
                DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence")
            )
            return

        yield encode_event(SourcesEvent(sources=[to_retrieved_source(hit) for hit in hits]))
        if await http_request.is_disconnected():
            return
        yield encode_event(StatusEvent(stage="generating"))
        messages = build_messages(payload.question, hits)
        async for text in generate_stream(
            settings.ollama_url,
            settings.profile.llm,
            messages,
            context_tokens=settings.profile.context_tokens,
        ):
            if await http_request.is_disconnected():
                return
            yield encode_event(TokenEvent(text=text))
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
        _generation_semaphore.release()

    groundedness: Groundedness = "insufficient_evidence" if generation_failed else "grounded"
    yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness=groundedness))


@router.post("/ask", response_model=None)
async def ask(
    payload: AskRequest,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse | JSONResponse:
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
        _stream_answer(payload, settings, http_request),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
