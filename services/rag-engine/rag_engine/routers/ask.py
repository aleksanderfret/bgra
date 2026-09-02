"""The question-answering endpoint.

Retrieval and generation are not implemented yet. Until they are, this streams
a correctly-shaped response that reports `insufficient_evidence`, which is the
honest answer while no documents are indexed — and it exercises the whole
frontend path, so the UI can be built and tested before any model is on disk.

The stub emits no prose of its own: what the user reads comes from a `notice`
code the frontend translates, so nothing here has to pick a language.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..contract import AskRequest, DoneEvent, NoticeEvent, SourcesEvent, StatusEvent
from ..settings import Settings, get_settings
from ..sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_event

router = APIRouter(tags=["assistant"])

#: Small pause between frames so streaming is visibly incremental in the UI
#: while the real generator is still a placeholder.
_FRAME_DELAY_SECONDS = 0.02


async def _stream_answer(request: AskRequest, settings: Settings) -> AsyncIterator[str]:
    yield encode_event(StatusEvent(stage="retrieving"))
    await asyncio.sleep(_FRAME_DELAY_SECONDS)

    # Real retrieval lands in stage 3. Sending an explicit empty set keeps the
    # contract's guarantee intact: the frontend may display only what it gets
    # here, so right now it can display no figures at all.
    yield encode_event(SourcesEvent(sources=[]))
    await asyncio.sleep(_FRAME_DELAY_SECONDS)

    yield encode_event(
        NoticeEvent(
            code="engine_not_indexed",
            params={"gameId": request.game_id, "profile": settings.model_profile},
        )
    )

    yield encode_event(DoneEvent(answer_id=uuid4().hex, groundedness="insufficient_evidence"))


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
