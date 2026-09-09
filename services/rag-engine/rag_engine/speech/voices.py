"""Piper voice ids and download into an app-owned cache directory."""

from __future__ import annotations

import logging
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

AppLocale = Literal["en", "pl"]

TTS_VOICE_PL = "pl_PL-bass-high"
TTS_VOICE_EN = "en_US-lessac-medium"

ProgressCallback = Callable[[str], None]

# Official Piper release voice archives (onnx + json).
_PIPER_VOICE_URLS: dict[str, str] = {
    TTS_VOICE_PL: (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        "pl/pl_PL/bass/high/pl_PL-bass-high.onnx"
    ),
    f"{TTS_VOICE_PL}.json": (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        "pl/pl_PL/bass/high/pl_PL-bass-high.onnx.json"
    ),
    TTS_VOICE_EN: (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
    ),
    f"{TTS_VOICE_EN}.json": (
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    ),
}


def voice_for_locale(locale: AppLocale) -> str:
    if locale == "pl":
        return TTS_VOICE_PL
    return TTS_VOICE_EN


def parse_app_locale(value: str | None) -> AppLocale:
    if value is None:
        return "en"
    lowered = value.strip().lower()
    if lowered == "pl" or lowered.startswith("pl-") or lowered.startswith("pl_"):
        return "pl"
    return "en"


def piper_voices_dir(storage_dir: Path) -> Path:
    return storage_dir / "player" / "voices" / "piper"


def voice_onnx_path(storage_dir: Path, voice: str) -> Path:
    return piper_voices_dir(storage_dir) / f"{voice}.onnx"


def voice_config_path(storage_dir: Path, voice: str) -> Path:
    return piper_voices_dir(storage_dir) / f"{voice}.onnx.json"


def voice_is_ready(storage_dir: Path, voice: str) -> bool:
    return (
        voice_onnx_path(storage_dir, voice).is_file()
        and voice_config_path(storage_dir, voice).is_file()
    )


def ensure_piper_voice(
    storage_dir: Path,
    locale: AppLocale,
    *,
    progress: ProgressCallback | None = None,
) -> str:
    """Download the Piper onnx+json for `locale` if missing. Returns voice id."""
    voice = voice_for_locale(locale)
    if voice_is_ready(storage_dir, voice):
        return voice

    destination = piper_voices_dir(storage_dir)
    destination.mkdir(parents=True, exist_ok=True)

    onnx_url = _PIPER_VOICE_URLS[voice]
    json_url = _PIPER_VOICE_URLS[f"{voice}.json"]
    onnx_path = voice_onnx_path(storage_dir, voice)
    json_path = voice_config_path(storage_dir, voice)

    _download(onnx_url, onnx_path, progress=progress, label=voice)
    _download(json_url, json_path, progress=progress, label=f"{voice}.json")
    return voice


def _download(
    url: str,
    target: Path,
    *,
    progress: ProgressCallback | None,
    label: str,
) -> None:
    if progress is not None:
        progress(f"downloading Piper voice file: {label}")
    else:
        logger.info("Downloading Piper voice file: %s", label)
    tmp = target.with_suffix(target.suffix + ".tmp")
    try:
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, target)
    except urllib.error.URLError, OSError:
        tmp.unlink(missing_ok=True)
        raise
