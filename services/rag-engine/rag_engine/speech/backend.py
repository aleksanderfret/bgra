"""Platform STT backend selection and model identifiers."""

from __future__ import annotations

import sys

#: Hugging Face snapshot pulled on Darwin for mlx-whisper.
MLX_WHISPER_REPO = "mlx-community/whisper-large-v3-turbo"

#: faster-whisper size name on Windows / Linux (not an mlx repo id).
FASTER_WHISPER_MODEL = "large-v3-turbo"


class SpeechExtraMissingError(RuntimeError):
    """The optional `speech` extra is not installed in this environment."""


def speech_backend_name(platform: str | None = None) -> str:
    current = platform if platform is not None else sys.platform
    if current == "darwin":
        return "mlx-whisper"
    return "faster-whisper"


def stt_model_id(*, platform: str | None = None, profile_stt: str | None = None) -> str:
    """Resolve the STT pull/load id for this OS.

    Profile `stt` remains the Darwin HF id for pull_models compatibility.
    Non-Darwin always uses the faster-whisper size name so Windows never
    tries to load mlx weights.
    """
    backend = speech_backend_name(platform)
    if backend == "mlx-whisper":
        if profile_stt is not None and profile_stt.strip():
            return profile_stt.strip()
        return MLX_WHISPER_REPO
    return FASTER_WHISPER_MODEL
