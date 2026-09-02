"""Runtime configuration, including which local models to load.

Model choice is the single most hardware-dependent decision in this project,
so it lives in named profiles rather than being scattered through the code.
Switching machines is then a one-line change to `BGA_MODEL_PROFILE`.

The identifiers below are pull targets for three different runtimes and are
intentionally data, not code. Confirm them against the registries once with
`scripts/pull-models.sh` before relying on a profile.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


class ModelProfile(BaseModel):
    """One coherent set of models sized for a specific amount of memory."""

    label: str

    #: Ollama tag. Carries the teaching conversation, so decode speed and
    #: time-to-first-token matter more here than raw benchmark scores.
    llm: str

    #: Ollama tag for an optional stronger model, used only when a rules
    #: dispute needs arbitration and a few extra seconds are acceptable.
    llm_arbiter: str | None

    #: Ollama tag. Must be multilingual: questions are asked in Polish against
    #: rulebooks that are often English, so an English-only embedding model
    #: silently destroys recall.
    embedding: str

    #: Hugging Face id, loaded through sentence-transformers. A cross-encoder
    #: rerank step is what turns "roughly relevant pages" into the exact
    #: paragraph a rules question needs.
    reranker: str

    #: Ollama tag for a vision-language model, or None to disable figure
    #: understanding on memory-constrained machines.
    vision: str | None

    #: Hugging Face repo consumed by mlx-whisper.
    stt: str

    #: Piper voice name. Polish needs a Polish-trained voice; English-only
    #: engines mispronounce it badly regardless of audio quality.
    #: `pl_PL-bass-high` is a male teaching voice; other pl_PL options are
    #: gosia, darkman, mc_speech (medium) and mls_6892 (low).
    tts_voice: str

    #: Upper bound on prompt size. Larger contexts cost KV-cache memory and,
    #: on Apple Silicon, prefill time you feel as a pause before speech.
    context_tokens: int

    #: Rough on-disk total for this profile, to budget SSD space.
    approx_disk_gb: float


PROFILES: dict[str, ModelProfile] = {
    # Fits alongside an IDE and a browser on a 32 GB machine. Use while
    # building the pipeline; quality is adequate, latency is good.
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
    # Target machine. The mixture-of-experts model activates ~3B parameters
    # per token, so it answers at small-model speed while reasoning closer to
    # a 30B dense model — the right trade for a spoken conversation.
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
        # Always this file, not whatever directory you happened to start from.
        env_file=SERVICE_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    model_profile: str = "starter-32gb"

    #: Where Ollama listens. Nothing in this project calls a remote API.
    ollama_url: str = "http://127.0.0.1:11434"

    storage_dir: Path = SERVICE_ROOT / "storage"

    #: How many chunks to retrieve before reranking, and how many survive it.
    retrieval_candidates: int = Field(default=40, ge=1)
    retrieval_top_k: int = Field(default=6, ge=1)

    #: Below this rerank score the engine answers "not covered by the rules"
    #: instead of guessing. Tune it with the evaluation set, not by feel.
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
        """Page renders and figure crops served to the browser."""
        return self.storage_dir / "assets"

    @property
    def games_registry(self) -> Path:
        """Which games are indexed; written by the ingestion pipeline."""
        return self.storage_dir / "games.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
