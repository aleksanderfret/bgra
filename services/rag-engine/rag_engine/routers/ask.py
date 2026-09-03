"""Stub `/ask` until retrieval exists.

Streams a correctly shaped `insufficient_evidence` response so the UI can be
built against an empty store. Emits a `notice` code, never prose.
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

#: Pause so the stub still looks like a stream in the UI.
_FRAME_DELAY_SECONDS = 0.02


async def _stream_answer(request: AskRequest, settings: Settings) -> AsyncIterator[str]:
    yield encode_event(StatusEvent(stage="retrieving"))
    await asyncio.sleep(_FRAME_DELAY_SECONDS)

    # Empty on purpose: the UI may display only what it receives here.
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
