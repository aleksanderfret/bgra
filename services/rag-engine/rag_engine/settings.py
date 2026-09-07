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
PROMPT_RESERVE_TOKENS = 1_500
# Upper bound used only for the budget check — real chunks are shorter.
CHUNK_BUDGET_TOKENS = 600


class ModelProfile(BaseModel):
    label: str
    llm: str
    #: False for instruct-only builds. Asking them to think is a no-op, so /ask
    #: must not promise the player a careful re-read that never happens.
    llm_thinks: bool
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
        llm_thinks=True,
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
    # A 3B-active MoE reads the prompt ~3.5x faster than the 14B dense model it
    # replaced, which is what the player feels before the first word. The `2507`
    # instruct build, not plain `30b-a3b`: that one has no thinking switch in its
    # Ollama template, so its reasoning trace lands in the answer itself.
    "starter-32gb": ModelProfile(
        label="M1/M2 Pro, 32 GB unified memory",
        llm="qwen3:30b-a3b-instruct-2507-q4_K_M",
        llm_thinks=False,
        llm_arbiter=None,
        embedding="bge-m3",
        reranker="BAAI/bge-reranker-v2-m3",
        vision=None,
        stt="mlx-community/whisper-large-v3-turbo",
        tts_voice="pl_PL-bass-high",
        context_tokens=8192,
        retrieval_top_k=6,
        approx_disk_gb=21.0,
    ),
    "full-64gb": ModelProfile(
        label="M4/M5 Pro or Max, 64 GB unified memory",
        llm="qwen3:30b-a3b-instruct-2507-q4_K_M",
        llm_thinks=False,
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
    needed = PROMPT_RESERVE_TOKENS + profile.retrieval_top_k * CHUNK_BUDGET_TOKENS
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

    #: Hybrid search keeps this many candidates for the cross-encoder. Lower
    #: values cut ranking latency; the answer still uses retrieval_top_k passages.
    retrieval_candidates: int = Field(default=15, ge=1)

    #: When even the best passage scores below this, answer
    #: `insufficient_evidence` instead of guessing. Only has to catch a question
    #: about something else entirely — those measured at 0.0003, while a short
    #: but perfectly answerable question can score 0.07. Which of the remaining
    #: passages are noise is `relevance_share_of_best`, not this.
    min_relevance_score: float = 0.05

    #: Keep a passage while it scores at least this share of the best passage for
    #: the same question. Fewer passages is not automatically better: with only
    #: the two best ones the model was measured inventing a rule ("Army markers
    #: are Influence cubes") instead of admitting the rulebook is silent.
    relevance_share_of_best: float = Field(default=0.20, gt=0.0, le=1.0)

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
