"""Python side of the wire contract shared with `apps/web`.

The TypeScript definitions in `packages/api-contract/src/types.ts` are the
source of truth for the shapes; this module mirrors them. Fields are snake_case
in Python and camelCase on the wire, handled by the alias generator below.

`tests/test_contract_parity.py` reads the TypeScript file and fails if the two
sides drift apart.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DocumentKind = Literal["rulebook", "faq", "errata", "player_aid", "video_transcript"]

#: Documents ordered from lowest to highest authority. When two documents
#: disagree, the later entry wins: an errata sheet overrides the printed rules.
#: A video transcript never establishes a rule, it only supplies wording.
DOCUMENT_AUTHORITY: tuple[DocumentKind, ...] = (
    "video_transcript",
    "player_aid",
    "rulebook",
    "faq",
    "errata",
)

AnswerMode = Literal["teach", "arbitrate"]
PipelineStage = Literal["transcribing", "retrieving", "reranking", "generating", "speaking"]
Groundedness = Literal["grounded", "partial", "insufficient_evidence"]


class WireModel(BaseModel):
    """Base for anything crossing the process boundary."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RetrievedSource(WireModel):
    """A chunk the retriever actually returned.

    The frontend renders only what appears here, which is what stops a model
    from putting an invented figure on screen.
    """

    id: str
    game_id: str
    document_title: str
    document_kind: DocumentKind
    page: int | None = None
    score: float = 0.0
    excerpt: str = ""
    image_url: str | None = None


class AskRequest(WireModel):
    game_id: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=2000)
    mode: AnswerMode = "teach"
    session_id: str | None = None


class StatusEvent(WireModel):
    type: Literal["status"] = "status"
    stage: PipelineStage


class TranscriptEvent(WireModel):
    type: Literal["transcript"] = "transcript"
    text: str


class SourcesEvent(WireModel):
    type: Literal["sources"] = "sources"
    sources: list[RetrievedSource]


class TokenEvent(WireModel):
    type: Literal["token"] = "token"
    text: str


class FigureEvent(WireModel):
    type: Literal["figure"] = "figure"
    source_id: str


class AudioEvent(WireModel):
    type: Literal["audio"] = "audio"
    sequence: int
    mime_type: str
    data_base64: str


class DoneEvent(WireModel):
    type: Literal["done"] = "done"
    answer_id: str
    groundedness: Groundedness


class ErrorEvent(WireModel):
    type: Literal["error"] = "error"
    code: str
    message: str


AssistantEvent = Annotated[
    StatusEvent
    | TranscriptEvent
    | SourcesEvent
    | TokenEvent
    | FigureEvent
    | AudioEvent
    | DoneEvent
    | ErrorEvent,
    Field(discriminator="type"),
]


class GameSummary(WireModel):
    game_id: str
    title: str
    chunk_count: int = 0
    document_kinds: list[DocumentKind] = Field(default_factory=list)
    indexed_at: str | None = None


class HealthReport(WireModel):
    status: Literal["ok", "degraded"]
    components: dict[str, bool]
    models: dict[str, str]
