"""Speech-to-text interface. Implementations land in stage 5.

mlx-whisper on Apple Silicon; faster-whisper elsewhere. Selecting the backend
here keeps stage 5 from discovering Windows as a surprise.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Protocol


class SpeechToText(Protocol):
    def transcribe(self, audio_path: Path) -> str:
        """Return the recognised text for a recorded utterance."""


def speech_backend_name(platform: str | None = None) -> str:
    current = platform if platform is not None else sys.platform
    if current == "darwin":
        return "mlx-whisper"
    return "faster-whisper"
