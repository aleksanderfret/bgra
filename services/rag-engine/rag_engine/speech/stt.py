"""Speech-to-text adapters behind one protocol."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol

from rag_engine.speech.backend import SpeechExtraMissingError, speech_backend_name, stt_model_id
from rag_engine.speech.wav import WavValidationError, write_wav_temp

logger = logging.getLogger(__name__)


class SpeechToText(Protocol):
    def transcribe(self, audio_path: Path) -> str:
        """Return the recognised text for a recorded utterance."""


class _MlxWhisperStt:
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id

    def transcribe(self, audio_path: Path) -> str:
        try:
            import mlx_whisper
        except ImportError as error:
            raise SpeechExtraMissingError(
                "mlx-whisper is not installed. Sync the speech extra on macOS."
            ) from error
        result = mlx_whisper.transcribe(str(audio_path), path_or_hf_repo=self._model_id)
        text = result.get("text") if isinstance(result, dict) else None
        if not isinstance(text, str):
            return ""
        return text.strip()


class _FasterWhisperStt:
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id
        self._model: object | None = None

    def _load(self) -> object:
        if self._model is not None:
            return self._model
        try:
            from faster_whisper import WhisperModel
        except ImportError as error:
            raise SpeechExtraMissingError(
                "faster-whisper is not installed. Sync the speech extra on this OS."
            ) from error
        self._model = WhisperModel(self._model_id, device="cpu", compute_type="int8")
        return self._model

    def transcribe(self, audio_path: Path) -> str:
        model = self._load()
        segments, _info = model.transcribe(str(audio_path), beam_size=1)  # type: ignore[attr-defined]
        parts = [segment.text for segment in segments]
        return " ".join(part.strip() for part in parts if part.strip()).strip()


def create_speech_to_text(
    *,
    platform: str | None = None,
    profile_stt: str | None = None,
) -> SpeechToText:
    backend = speech_backend_name(platform)
    model_id = stt_model_id(platform=platform, profile_stt=profile_stt)
    if backend == "mlx-whisper":
        return _MlxWhisperStt(model_id)
    return _FasterWhisperStt(model_id)


def transcribe_wav_bytes(
    data: bytes,
    *,
    stt: SpeechToText | None = None,
    platform: str | None = None,
    profile_stt: str | None = None,
) -> str:
    """Validate WAV bytes, write a temp file, transcribe, then delete the temp file."""
    path = write_wav_temp(data)
    engine = (
        stt
        if stt is not None
        else create_speech_to_text(
            platform=platform,
            profile_stt=profile_stt,
        )
    )
    try:
        return engine.transcribe(path).strip()
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove temp WAV %s", path)


__all__ = [
    "SpeechExtraMissingError",
    "SpeechToText",
    "WavValidationError",
    "create_speech_to_text",
    "transcribe_wav_bytes",
]
