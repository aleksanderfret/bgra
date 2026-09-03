from typing import Annotated

from fastapi import APIRouter, Depends

from ..contract import HealthReport
from ..engines.llm import OllamaUnreachableError, installed_ollama_tags
from ..pull_models import ollama_fields
from ..settings import Settings, get_settings

router = APIRouter(tags=["system"])

PROBE_TIMEOUT_SECONDS = 1.0


@router.get("/health")
async def read_health(
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

    components = {
        "ollama": ollama_up,
        "storage": settings.storage_dir.is_dir(),
    }
    models = {
        "profile": settings.model_profile,
        "llm": profile.llm,
        "embedding": profile.embedding,
        "reranker": profile.reranker,
        "stt": profile.stt,
        "tts": profile.tts_voice,
    }

    degraded = not all(components.values()) or len(missing) > 0

    return HealthReport(
        status="degraded" if degraded else "ok",
        components=components,
        models=models,
        missing_models=missing,
    )
