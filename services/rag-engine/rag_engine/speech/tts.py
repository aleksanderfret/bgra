"""Piper text-to-speech → WAV bytes for SSE audio frames."""

from __future__ import annotations

import io
import logging
import threading
import wave
from collections.abc import Iterator
from pathlib import Path

from rag_engine.speech.backend import SpeechExtraMissingError
from rag_engine.speech.voices import voice_config_path, voice_onnx_path

logger = logging.getLogger(__name__)

AUDIO_MIME_WAV = "audio/wav"

_voice_lock = threading.Lock()
_voice_cache: dict[str, object] = {}


def clear_piper_voice_cache() -> None:
    """Drop cached Piper models (tests)."""
    with _voice_lock:
        _voice_cache.clear()


def _load_piper_voice(onnx: Path, config: Path) -> object:
    key = str(onnx.resolve())
    with _voice_lock:
        cached = _voice_cache.get(key)
        if cached is not None:
            return cached
        try:
            from piper import PiperVoice
        except ImportError as error:
            raise SpeechExtraMissingError(
                "piper-tts is not installed. Sync the speech extra."
            ) from error
        voice_model = PiperVoice.load(str(onnx), config_path=str(config))
        _voice_cache[key] = voice_model
        return voice_model


def synthesize_sentence_wav(
    text: str,
    *,
    storage_dir: Path,
    voice: str,
) -> bytes:
    """Synthesize one sentence to PCM WAV bytes. Raises if Piper or voice missing."""
    cleaned = text.strip()
    if not cleaned:
        return b""

    onnx = voice_onnx_path(storage_dir, voice)
    config = voice_config_path(storage_dir, voice)
    if not onnx.is_file() or not config.is_file():
        raise FileNotFoundError(f"Piper voice not ready: {voice}")

    voice_model = _load_piper_voice(onnx, config)
    # piper-tts API: synthesize returns audio chunks; collect PCM then wrap WAV.
    sample_rate = int(getattr(voice_model, "sample_rate", 22050))
    pcm_parts: list[bytes] = []
    for chunk in _iter_pcm(voice_model, cleaned):
        pcm_parts.append(chunk)
    pcm = b"".join(pcm_parts)
    return _pcm16_to_wav(pcm, sample_rate=sample_rate)


def _iter_pcm(voice_model: object, text: str) -> Iterator[bytes]:
    synthesize = getattr(voice_model, "synthesize", None)
    if synthesize is None:
        raise SpeechExtraMissingError("PiperVoice.synthesize is unavailable")
    result = synthesize(text)
    # Newer piper returns AudioChunk iterators; older may return raw bytes.
    if isinstance(result, (bytes, bytearray)):
        yield bytes(result)
        return
    for item in result:
        audio = getattr(item, "audio_int16_bytes", None)
        if isinstance(audio, (bytes, bytearray)):
            yield bytes(audio)
            continue
        if isinstance(item, (bytes, bytearray)):
            yield bytes(item)
            continue
        raw = getattr(item, "audio", None)
        if isinstance(raw, (bytes, bytearray)):
            yield bytes(raw)


def _pcm16_to_wav(pcm: bytes, *, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm)
    return buffer.getvalue()
