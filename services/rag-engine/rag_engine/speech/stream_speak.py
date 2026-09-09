"""Interleave Piper audio frames with LLM token frames for spoken answers."""

from __future__ import annotations

import asyncio
import base64
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

from rag_engine.contract import AudioEvent, StatusEvent, TokenEvent
from rag_engine.speech.sentences import flush_completed_sentences, force_flush_remainder
from rag_engine.speech.tts import AUDIO_MIME_WAV, synthesize_sentence_wav
from rag_engine.speech.voices import AppLocale, voice_for_locale
from rag_engine.sse import encode_event

logger = logging.getLogger(__name__)

IsDisconnected = Callable[[], Awaitable[bool]]


async def speak_alongside_tokens(
    token_texts: AsyncIterator[str],
    *,
    speak: bool,
    storage_dir: Path,
    locale: AppLocale,
    is_disconnected: IsDisconnected,
) -> AsyncIterator[str]:
    """Yield encoded SSE frames for tokens, and audio when `speak` is true.

    First audio frame is preceded by `status:speaking`. Caller emits `done`.
    """
    if not speak:
        async for text in token_texts:
            if await is_disconnected():
                return
            yield encode_event(TokenEvent(text=text))
        return

    voice = voice_for_locale(locale)
    buffer = ""
    sequence = 0
    speaking_started = False

    async for text in token_texts:
        if await is_disconnected():
            return
        yield encode_event(TokenEvent(text=text))
        buffer += text
        completed, buffer = flush_completed_sentences(buffer)
        for sentence in completed:
            if await is_disconnected():
                return
            frame = await _audio_frame(
                sentence,
                storage_dir=storage_dir,
                voice=voice,
                sequence=sequence + 1,
            )
            if frame is None:
                continue
            sequence += 1
            if not speaking_started:
                yield encode_event(StatusEvent(stage="speaking"))
                speaking_started = True
            yield frame

    for sentence in force_flush_remainder(buffer):
        if await is_disconnected():
            return
        frame = await _audio_frame(
            sentence,
            storage_dir=storage_dir,
            voice=voice,
            sequence=sequence + 1,
        )
        if frame is None:
            continue
        sequence += 1
        if not speaking_started:
            yield encode_event(StatusEvent(stage="speaking"))
            speaking_started = True
        yield frame


async def _audio_frame(
    sentence: str,
    *,
    storage_dir: Path,
    voice: str,
    sequence: int,
) -> str | None:
    try:
        wav = await asyncio.to_thread(
            synthesize_sentence_wav,
            sentence,
            storage_dir=storage_dir,
            voice=voice,
        )
    except Exception:
        logger.exception("Piper failed for a sentence; skipping audio for it")
        return None
    if not wav:
        return None
    return encode_event(
        AudioEvent(
            sequence=sequence,
            mime_type=AUDIO_MIME_WAV,
            data_base64=base64.b64encode(wav).decode("ascii"),
        )
    )
