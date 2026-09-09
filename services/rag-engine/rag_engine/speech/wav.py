"""Validate and stage 16 kHz mono PCM WAV for STT (no ffmpeg)."""

from __future__ import annotations

import io
import struct
import tempfile
import wave
from pathlib import Path

#: ~30 s of 16-bit mono 16 kHz, with headroom for headers.
MAX_WAV_BYTES = 2 * 1024 * 1024

_REQUIRED_RATE = 16_000
_REQUIRED_CHANNELS = 1
_REQUIRED_SAMPLE_WIDTH = 2


class WavValidationError(ValueError):
    """Audio is not a transcribable 16 kHz mono PCM WAV."""


def assert_transcribable_wav(data: bytes) -> None:
    if len(data) == 0:
        raise WavValidationError("empty audio")
    if len(data) > MAX_WAV_BYTES:
        raise WavValidationError(f"audio exceeds {MAX_WAV_BYTES} bytes")
    if len(data) < 44 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise WavValidationError("not a RIFF/WAVE file")

    with wave.open(io.BytesIO(data), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.getnframes()

    if channels != _REQUIRED_CHANNELS:
        raise WavValidationError(f"expected {_REQUIRED_CHANNELS} channel(s), got {channels}")
    if sample_width != _REQUIRED_SAMPLE_WIDTH:
        raise WavValidationError(f"expected {_REQUIRED_SAMPLE_WIDTH}-byte samples")
    if rate != _REQUIRED_RATE:
        raise WavValidationError(f"expected {_REQUIRED_RATE} Hz, got {rate}")
    if frames <= 0:
        raise WavValidationError("WAV has no frames")


def write_wav_temp(data: bytes) -> Path:
    """Validate bytes and write to a NamedTemporaryFile that the caller must delete."""
    assert_transcribable_wav(data)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(data)
        tmp.flush()
        return Path(tmp.name)


def pcm16_mono_wav_bytes(samples: bytes, *, sample_rate: int = _REQUIRED_RATE) -> bytes:
    """Build a minimal WAV from raw little-endian PCM16 mono samples (tests / helpers)."""
    if sample_rate != _REQUIRED_RATE:
        raise WavValidationError(f"helper only builds {_REQUIRED_RATE} Hz WAV")
    data_size = len(samples)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        _REQUIRED_CHANNELS,
        sample_rate,
        sample_rate * _REQUIRED_CHANNELS * _REQUIRED_SAMPLE_WIDTH,
        _REQUIRED_CHANNELS * _REQUIRED_SAMPLE_WIDTH,
        _REQUIRED_SAMPLE_WIDTH * 8,
        b"data",
        data_size,
    )
    return header + samples
