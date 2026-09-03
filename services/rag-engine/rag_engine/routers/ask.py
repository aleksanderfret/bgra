"""Stream a model-generated answer, one token at a time.

Stage 1: the model answers from general knowledge (no document retrieval yet).
A semaphore limits generation to one answer at a time — a second question waits
until the first finishes or the client disconnects.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from ..contract import (
    AskRequest,
    DoneEvent,
    ErrorEvent,
    Groundedness,
    NoticeEvent,
    SourcesEvent,
    StatusEvent,
    TokenEvent,
)
from ..engines.llm import (
    GenerationTimeoutError,
    ModelNotInstalledError,
    OllamaUnreachableError,
    generate_stream,
    installed_ollama_tags,
)
from ..ingest.registry import validate_expansion_ids
from ..settings import Settings, get_settings
from ..sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assistant"])

_generation_semaphore = asyncio.Semaphore(1)

_SYSTEM_PROMPT = (
    "You are a board game rules assistant. Answer in the same language the user writes in. "
    "You do not have access to any rulebooks yet — answer from general knowledge "
    "and mention that you do not have the specific rulebook for this game."
)


async def _stream_answer(request: AskRequest, settings: Settings) -> AsyncIterator[str]:
    yield encode_event(StatusEvent(stage="retrieving"))
    yield encode_event(SourcesEvent(sources=[]))

    try:
        tags = await installed_ollama_tags(settings.ollama_url)
    except OllamaUnreachableError:
        yield encode_event(
            NoticeEvent(
                code="engine_not_indexed",
                params={"gameId": request.game_id, "profile": settings.model_profile},
            )
        )
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    model = settings.profile.llm
    if model not in tags:
        yield encode_event(
            NoticeEvent(
                code="engine_not_indexed",
                params={"gameId": request.game_id, "profile": settings.model_profile},
            )
        )
        yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))
        return

    yield encode_event(StatusEvent(stage="generating"))

    generation_failed = False
    await _generation_semaphore.acquire()
    try:
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": request.question},
        ]
        async for text in generate_stream(settings.ollama_url, model, messages):
            yield encode_event(TokenEvent(text=text))
    except GenerationTimeoutError:
        generation_failed = True
        logger.warning("Generation timed out for model %s", model)
        yield encode_event(
            ErrorEvent(
                code="generation_timeout",
                message="Model stopped producing tokens.",
            )
        )
    except ModelNotInstalledError:
        generation_failed = True
        yield encode_event(
            ErrorEvent(
                code="model_missing",
                message=f"Model {model} disappeared during generation.",
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

    groundedness: Groundedness = "insufficient_evidence" if generation_failed else "partial"
    yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness=groundedness))


@router.post("/ask", response_model=None)
async def ask(
    request: AskRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse | JSONResponse:
    try:
        validate_expansion_ids(settings.storage_dir, request.game_id, request.expansion_ids)
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
        _stream_answer(request, settings),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
