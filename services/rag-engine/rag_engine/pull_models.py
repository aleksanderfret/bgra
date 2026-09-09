"""Download the models named by the active profile.

Portable entry point used by the desktop app and by ``scripts/pull-models.sh``.
Ollama tags are pulled over HTTP; Hugging Face assets for the reranker / STT /
TTS are downloaded explicitly so first launch does not hang silently.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from collections.abc import Callable

from rag_engine.settings import PROFILES, ModelProfile, Settings, get_settings

ProgressCallback = Callable[[str], None]


def _log(message: str, progress: ProgressCallback | None) -> None:
    if progress is not None:
        progress(message)
    else:
        print(message, flush=True)


def ollama_tags(ollama_url: str) -> set[str]:
    request = urllib.request.Request(f"{ollama_url.rstrip('/')}/api/tags", method="GET")
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    names: set[str] = set()
    for model in payload.get("models", []):
        name = model.get("name")
        if isinstance(name, str):
            names.add(name)
            # Ollama lists "tag:latest"; profiles may omit ":latest".
            if name.endswith(":latest"):
                names.add(name.removesuffix(":latest"))
    return names


def pull_ollama_model(ollama_url: str, tag: str, progress: ProgressCallback | None) -> None:
    _log(f"pulling ollama model: {tag}", progress)
    body = json.dumps({"name": tag, "stream": False}).encode("utf-8")
    request = urllib.request.Request(
        f"{ollama_url.rstrip('/')}/api/pull",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=3_600) as response:
        response.read()


def pull_huggingface_snapshot(repo_id: str, progress: ProgressCallback | None) -> None:
    _log(f"downloading Hugging Face snapshot: {repo_id}", progress)
    try:
        from huggingface_hub import snapshot_download
    except ImportError as error:
        raise SystemExit(
            "huggingface_hub is required to pre-download the reranker/STT. "
            "Install the retrieval or speech extra, or pip install huggingface_hub."
        ) from error

    snapshot_download(repo_id=repo_id)


def pull_piper_voice(voice: str, progress: ProgressCallback | None) -> None:
    _log(f"ensuring Piper voice is available: {voice}", progress)
    # pull_models runs before Settings.storage_dir is always the service storage;
    # voices land under the same tree the engine uses at runtime.
    from rag_engine.settings import get_settings
    from rag_engine.speech.voices import (
        TTS_VOICE_EN,
        TTS_VOICE_PL,
        ensure_piper_voice,
    )

    storage = get_settings().storage_dir
    locale = "pl" if voice == TTS_VOICE_PL else "en"
    if voice not in {TTS_VOICE_PL, TTS_VOICE_EN}:
        locale = "en" if "en_" in voice or voice.startswith("en") else "pl"
    ensure_piper_voice(storage, locale, progress=progress)  # type: ignore[arg-type]


def ollama_fields(profile: ModelProfile) -> list[tuple[str, str]]:
    fields: list[tuple[str, str]] = [("llm", profile.llm), ("embedding", profile.embedding)]
    if profile.llm_arbiter:
        fields.append(("llm_arbiter", profile.llm_arbiter))
    if profile.vision:
        fields.append(("vision", profile.vision))
    return fields


def pull_profile(
    settings: Settings,
    *,
    progress: ProgressCallback | None = None,
    skip_huggingface: bool = False,
) -> None:
    profile = settings.profile
    _log(f"Profile: {settings.model_profile}", progress)

    try:
        for _field, tag in ollama_fields(profile):
            pull_ollama_model(settings.ollama_url, tag, progress)
    except urllib.error.URLError as error:
        raise SystemExit(
            f"Ollama is not reachable at {settings.ollama_url}: {error}. "
            "Install it from https://ollama.com/download and start it first."
        ) from error

    try:
        installed = ollama_tags(settings.ollama_url)
    except urllib.error.URLError:
        installed = set()
    missing = [tag for _, tag in ollama_fields(profile) if tag not in installed]
    if missing:
        _log(
            f"WARNING: these models were pulled but did not appear in the installed list: "
            f"{', '.join(missing)}. The tags may have been renamed or removed from the "
            f"Ollama registry.",
            progress,
        )
    else:
        _log(f"All {len(ollama_fields(profile))} Ollama models verified as installed.", progress)

    if not skip_huggingface:
        # Reranker is always needed for stage 3; pull it up-front so first ask
        # does not freeze while sentence-transformers downloads ~GB of weights.
        pull_huggingface_snapshot(profile.reranker, progress)
        from rag_engine.speech.backend import speech_backend_name, stt_model_id

        stt_id = stt_model_id(profile_stt=profile.stt)
        if speech_backend_name() == "mlx-whisper" or "/" in stt_id:
            pull_huggingface_snapshot(stt_id, progress)
        elif speech_backend_name() == "faster-whisper":
            # Prefetch the HF snapshot so first mic use is not a silent multi-GB wait.
            fw_repo = f"Systran/faster-whisper-{stt_id}"
            _log(f"pulling faster-whisper weights: {fw_repo}", progress)
            pull_huggingface_snapshot(fw_repo, progress)
        pull_piper_voice(profile.tts_voice, progress)

    _log("Done.", progress)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILES),
        help="Override BGA_MODEL_PROFILE for this run",
    )
    parser.add_argument(
        "--skip-huggingface",
        action="store_true",
        help="Only pull Ollama tags (used by the shell helper during early stages)",
    )
    args = parser.parse_args(argv)

    settings = Settings(model_profile=args.profile) if args.profile else get_settings()

    pull_profile(settings, skip_huggingface=args.skip_huggingface)
    return 0


if __name__ == "__main__":
    sys.exit(main())
