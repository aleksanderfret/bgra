from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from ..contract import HealthReport
from ..settings import Settings, get_settings

router = APIRouter(tags=["system"])

PROBE_TIMEOUT_SECONDS = 1.0  # /health must not be the slowest thing on the page.


async def _ollama_reachable(base_url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SECONDS) as client:
            response = await client.get(f"{base_url}/api/tags")
        return response.status_code == httpx.codes.OK
    except httpx.HTTPError:
        return False


@router.get("/health")
async def read_health(
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthReport:
    profile = settings.profile
    components = {
        "ollama": await _ollama_reachable(settings.ollama_url),
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
    return HealthReport(
        status="ok" if all(components.values()) else "degraded",
        components=components,
        models=models,
    )
