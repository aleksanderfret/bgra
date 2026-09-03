"""Named model profiles. Switching machines is `BGA_MODEL_PROFILE`, not a code edit.

Identifiers are pull targets for Ollama / Hugging Face / Piper. Confirm them
with `scripts/pull-models.sh` before relying on a profile.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent

# Reserved for the system prompt and the user's question when sizing retrieval.
_PROMPT_RESERVE_TOKENS = 1_500
# Upper bound used only for the budget check — real chunks are shorter.
_CHUNK_BUDGET_TOKENS = 600


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
    #: How many reranked passages enter the prompt. Tied to context_tokens so a
    #: short window cannot silently truncate evidence into a hallucination.
    retrieval_top_k: int = Field(ge=1)
    approx_disk_gb: float


PROFILES: dict[str, ModelProfile] = {
    "minimal-16gb": ModelProfile(
        label="16 GB unified memory or ~10 GB VRAM",
        llm="qwen3:8b",
        llm_arbiter=None,
        embedding="bge-m3",
        reranker="BAAI/bge-reranker-v2-m3",
        vision=None,
        stt="mlx-community/whisper-large-v3-turbo",
        tts_voice="pl_PL-bass-high",
        context_tokens=4096,
        retrieval_top_k=3,
        approx_disk_gb=6.0,
    ),
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
        retrieval_top_k=6,
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
        retrieval_top_k=6,
        approx_disk_gb=48.0,
    ),
}


def profile_context_budget_ok(profile: ModelProfile) -> bool:
    """True when the profile's top_k passages fit inside its context window."""
    needed = _PROMPT_RESERVE_TOKENS + profile.retrieval_top_k * _CHUNK_BUDGET_TOKENS
    return needed <= profile.context_tokens


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
    def retrieval_top_k(self) -> int:
        return self.profile.retrieval_top_k

    @property
    def assets_dir(self) -> Path:
        return self.storage_dir / "assets"

    @property
    def games_registry(self) -> Path:
        return self.storage_dir / "games.json"


def ensure_storage_writable(storage_dir: Path) -> None:
    """Create the storage root and fail loudly when it is not writable.

    Called before serving so a read-only packaged app directory surfaces as a
    one-line configuration error instead of a PermissionError during import.
    """
    try:
        storage_dir.mkdir(parents=True, exist_ok=True)
        probe = storage_dir / ".write-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as error:
        raise SystemExit(
            f"BGA_STORAGE_DIR is not writable: {storage_dir} ({error}). "
            "Set BGA_STORAGE_DIR to a user-owned directory."
        ) from error


@lru_cache
def get_settings() -> Settings:
    return Settings()
