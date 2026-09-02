"""The question-answering endpoint.

Retrieval and generation are not implemented yet. Until they are, this streams
a correctly-shaped response that reports `insufficient_evidence`, which is the
honest answer while no documents are indexed — and it exercises the whole
frontend path, so the UI can be built and tested before any model is on disk.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..contract import AskRequest, DoneEvent, SourcesEvent, StatusEvent, TokenEvent
from ..settings import Settings, get_settings
from ..sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_event

router = APIRouter(tags=["assistant"])

#: Small pause between tokens so streaming is visibly incremental in the UI
#: while the real generator is still a placeholder.
_TOKEN_DELAY_SECONDS = 0.02


def _placeholder_answer(request: AskRequest, settings: Settings) -> str:
    return (
        f"Nie mam jeszcze wczytanych dokumentów do gry „{request.game_id}”, "
        "więc nie odpowiem na to pytanie w sposób oparty na zasadach.\n\n"
        "Silnik działa i strumieniowanie jest sprawne — brakuje kroku wyszukiwania "
        f"(etap 3 planu). Aktywny profil modeli: {settings.model_profile}."
    )


async def _stream_answer(request: AskRequest, settings: Settings) -> AsyncIterator[str]:
    yield encode_event(StatusEvent(stage="retrieving"))

    # Real retrieval lands in stage 3. Sending an explicit empty set keeps the
    # contract's guarantee intact: the frontend may display only what it gets
    # here, so right now it can display no figures at all.
    yield encode_event(SourcesEvent(sources=[]))

    yield encode_event(StatusEvent(stage="generating"))
    for word in _placeholder_answer(request, settings).split(" "):
        yield encode_event(TokenEvent(text=f"{word} "))
        await asyncio.sleep(_TOKEN_DELAY_SECONDS)

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
