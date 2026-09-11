from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ..contract import HealthReport, RetrievalReloadResponse
from ..engines.llm import OllamaUnreachableError, installed_ollama_tags
from ..pull_models import ollama_fields
from ..settings import Settings, get_settings
from ..speech import voice_for_locale, voice_is_ready
from ..speech.backend import speech_backend_name

router = APIRouter(tags=["system"])

PROBE_TIMEOUT_SECONDS = 1.0


@router.post("/retrieval/reload")
async def reload_retrieval(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RetrievalReloadResponse:
    if bool(getattr(request.app.state, "retrieval_loading", False)):
        return RetrievalReloadResponse(started=False)
    if getattr(request.app.state, "retrieval_stack", None) is not None:
        return RetrievalReloadResponse(started=False)
    # Lazy import: main mounts this router at import time.
    from ..main import schedule_retrieval_load

    schedule_retrieval_load(request.app, settings.profile.reranker)
    return RetrievalReloadResponse(started=True)


@router.get("/health")
async def read_health(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthReport:
    profile = settings.profile

    ollama_up = True
    missing: list[str] = []
    try:
        tags = await installed_ollama_tags(settings.ollama_url, timeout=PROBE_TIMEOUT_SECONDS)
        required = ollama_fields(profile)
        for _role, tag in required:
            if tag not in tags:
                missing.append(tag)
    except OllamaUnreachableError:
        ollama_up = False

    stack = getattr(request.app.state, "retrieval_stack", None)
    retrieval_ready = stack is not None
    retrieval_loading = bool(getattr(request.app.state, "retrieval_loading", False))
    layout_ingest = bool(getattr(request.app.state, "layout_ingest", False))
    storage_ok = settings.storage_dir.is_dir()
    profile_voice = voice_for_locale("pl" if profile.tts_voice.startswith("pl_") else "en")
    # Prefer the profile's configured Piper id when it matches a known voice file.
    tts_ready = voice_is_ready(settings.storage_dir, profile.tts_voice) or voice_is_ready(
        settings.storage_dir, profile_voice
    )
    try:
        import piper  # noqa: F401

        speech_tts_pkg = True
    except ImportError:
        speech_tts_pkg = False
    try:
        if speech_backend_name() == "mlx-whisper":
            import mlx_whisper  # noqa: F401
        else:
            import faster_whisper  # noqa: F401

        speech_stt_pkg = True
    except ImportError:
        speech_stt_pkg = False

    components = {
        "ollama": ollama_up,
        "storage": storage_ok,
        "index": retrieval_ready,
        "reranker": retrieval_ready,
        "retrieval_loading": retrieval_loading,
        "layout_ingest": layout_ingest,
        "library_catch_up": bool(getattr(request.app.state, "library_catch_up", False)),
        "speech_stt": speech_stt_pkg,
        "speech_tts": speech_tts_pkg and tts_ready,
    }
    models: dict[str, str] = {
        "profile": settings.model_profile,
        "llm": profile.llm,
        "embedding": profile.embedding,
        "reranker": profile.reranker,
        "stt": profile.stt,
        "tts": profile.tts_voice,
    }
    if profile.llm_arbiter:
        models["llm_arbiter"] = profile.llm_arbiter
    if profile.vision:
        models["vision"] = profile.vision

    degraded = (not ollama_up) or (not storage_ok) or len(missing) > 0
    warm_stage = getattr(request.app.state, "warm_stage", None)

    return HealthReport(
        status="degraded" if degraded else "ok",
        components=components,
        models=models,
        missing_models=missing,
        warm_stage=warm_stage,
    )
