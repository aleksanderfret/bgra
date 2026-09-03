"""Named model profiles. Switching machines is `BGA_MODEL_PROFILE`, not a code edit.

Identifiers are pull targets for Ollama / Hugging Face / Piper. Confirm them
with `scripts/pull-models.sh` before relying on a profile.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


class ModelProfile(BaseModel):
    label: str
    llm: str
    #: Stronger model used only to settle a dispute; a few extra seconds are fine.
    llm_arbiter: str | None
    #: Must be multilingual: Polish questions against English rulebooks.
    embedding: str
    reranker: str
    vision: str | None
    stt: str
    #: English-only voices mispronounce Polish regardless of audio quality.
    tts_voice: str
    context_tokens: int
    approx_disk_gb: float


PROFILES: dict[str, ModelProfile] = {
    "starter-32gb": ModelProfile(
        label="M1/M2 Pro, 32 GB unified memory",
        llm="qwen3:14b",
        llm_arbiter=None,
        embedding="bge-m3",
        reranker="BAAI/bge-reranker-v2-m3",
        vision=None,
        stt="mlx-community/whisper-large-v3-turbo",
        tts_voice="pl_PL-bass-high",
        context_tokens=8192,
        approx_disk_gb=12.0,
    ),
    # MoE: ~3B active params/token, so it answers at small-model speed.
    "full-64gb": ModelProfile(
        label="M4/M5 Pro or Max, 64 GB unified memory",
        llm="qwen3:30b-a3b",
        llm_arbiter="qwen3:32b",
        embedding="bge-m3",
        reranker="BAAI/bge-reranker-v2-m3",
        vision="qwen2.5vl:7b",
        stt="mlx-community/whisper-large-v3-turbo",
        tts_voice="pl_PL-bass-high",
        context_tokens=32768,
        approx_disk_gb=48.0,
    ),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BGA_",
        # This file, not cwd — the process may start from the repo root.
        env_file=SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    model_profile: str = "starter-32gb"

    #: Local only. Nothing in this project calls a remote API.
    ollama_url: str = "http://127.0.0.1:11434"

    storage_dir: Path = SERVICE_ROOT / "storage"

    retrieval_candidates: int = Field(default=40, ge=1)
    retrieval_top_k: int = Field(default=6, ge=1)

    #: Below this, answer `insufficient_evidence` instead of guessing.
    min_relevance_score: float = 0.35

    @property
    def profile(self) -> ModelProfile:
        try:
            return PROFILES[self.model_profile]
        except KeyError as error:
            known = ", ".join(sorted(PROFILES))
            raise ValueError(
                f"Unknown BGA_MODEL_PROFILE {self.model_profile!r}. Known profiles: {known}."
            ) from error

    @property
    def assets_dir(self) -> Path:
        return self.storage_dir / "assets"

    @property
    def games_registry(self) -> Path:
        return self.storage_dir / "games.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
