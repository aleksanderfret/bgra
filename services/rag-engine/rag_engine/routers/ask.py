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
from fastapi.responses import StreamingResponse

from ..contract import (
    AskRequest,
    DoneEvent,
    ErrorEvent,
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

    await _generation_semaphore.acquire()
    try:
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": request.question},
        ]
        async for text in generate_stream(settings.ollama_url, model, messages):
            yield encode_event(TokenEvent(text=text))
    except GenerationTimeoutError:
        logger.warning("Generation timed out for model %s", model)
        yield encode_event(
            ErrorEvent(
                code="generation_timeout",
                message="Model stopped producing tokens.",
            )
        )
    except ModelNotInstalledError:
        yield encode_event(
            ErrorEvent(
                code="model_missing",
                message=f"Model {model} disappeared during generation.",
            )
        )
    except OllamaUnreachableError:
        yield encode_event(
            ErrorEvent(
                code="engine_unreachable",
                message="Lost connection to Ollama during generation.",
            )
        )
    finally:
        _generation_semaphore.release()

    yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="partial"))


@router.post("/ask")
async def ask(
    request: AskRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    return StreamingResponse(
        _stream_answer(request, settings),
        media_type=SSE_MEDIA_TYPE,
        headers=SSE_HEADERS,
    )
