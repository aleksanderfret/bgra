"""Voice asset endpoints: ensure Piper voice for a UI locale."""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from rag_engine.contract import EnsureVoiceRequest, EnsureVoiceResponse
from rag_engine.settings import Settings, get_settings
from rag_engine.speech import ensure_piper_voice, parse_app_locale, voice_for_locale, voice_is_ready

logger = logging.getLogger(__name__)

router = APIRouter(tags=["speech"])


@router.post("/speech/ensure-voice", response_model=EnsureVoiceResponse)
async def ensure_voice(
    payload: EnsureVoiceRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> EnsureVoiceResponse:
    locale = parse_app_locale(payload.locale)
    voice = voice_for_locale(locale)
    if not voice_is_ready(settings.storage_dir, voice):
        logger.info("Ensuring Piper voice for locale %s (%s)", locale, voice)
        await asyncio.to_thread(ensure_piper_voice, settings.storage_dir, locale)
    return EnsureVoiceResponse(ready=True, voice=voice, locale=locale)
