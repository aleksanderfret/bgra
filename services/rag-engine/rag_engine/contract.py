"""Python mirror of `packages/api-contract/src/types.ts`.

Fields are snake_case here and camelCase on the wire (`alias_generator`).
`tests/test_contract_parity.py` fails if the two sides drift.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DocumentKind = Literal["rulebook", "faq", "errata", "player_aid", "video_transcript"]

#: `game_id` is both the retrieval filter and a directory name under
#: `storage/assets`, so it stays a strict slug. Kept in step with
#: `GAME_ID_PATTERN` in the TypeScript contract by the parity test.
GAME_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,63}$"

#: Document keys reuse the same slug rules as game ids.
DOC_KEY_PATTERN = GAME_ID_PATTERN

#: Later entries win a conflict. Transcripts never establish a rule.
DOCUMENT_AUTHORITY: tuple[DocumentKind, ...] = (
    "video_transcript",
    "player_aid",
    "rulebook",
    "faq",
    "errata",
)

AnswerMode = Literal["teach", "arbitrate"]
PipelineStage = Literal[
    "planning",
    "transcribing",
    "retrieving",
    "reranking",
    "generating",
    "speaking",
]
Groundedness = Literal["grounded", "partial", "insufficient_evidence"]

#: Soft pedagogical spine — guidance for planning, not a fixed five-slot lesson.
LessonSpineHint = Literal["goal", "theme", "mechanics", "turn", "sample_move"]
LessonSessionStatus = Literal["planning", "active", "paused", "completed", "expired"]
LessonTurnKind = Literal["plan", "unit", "digression"]


class WireModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RetrievedSource(WireModel):
    """The UI may show a figure only if its id appears here and `image_url` is set."""

    id: str
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    document_title: str
    document_kind: DocumentKind
    page: int | None = None
    score: float = 0.0
    excerpt: str = ""
    #: Relative to the engine root; the frontend prefixes its own proxy path.
    image_url: str | None = None


class AskRequest(WireModel):
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    question: str = Field(min_length=1, max_length=2000)
    mode: AnswerMode = "arbitrate"
    session_id: str | None = None
    expansion_ids: list[str] = Field(default_factory=list)
    #: When true, Piper speaks completed sentences while tokens stream.
    speak: bool = False
    #: UI locale for the Piper voice (`en` or `pl`). Defaults to English.
    locale: str = "en"


class LessonSyllabusUnit(WireModel):
    unit_id: str
    title: str
    section_refs: list[str] = Field(default_factory=list)
    spine_hint: LessonSpineHint | None = None


class LessonTurn(WireModel):
    id: str
    kind: LessonTurnKind
    unit_id: str | None = None
    question: str | None = None
    text: str
    sources: list[RetrievedSource] = Field(default_factory=list)
    groundedness: Groundedness


class LessonSession(WireModel):
    """Server-owned teaching session. `session_id` is issued by the engine (D13)."""

    session_id: str
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    expansion_ids: list[str] = Field(default_factory=list)
    syllabus: list[LessonSyllabusUnit] = Field(default_factory=list)
    unit_index: int = 0
    status: LessonSessionStatus
    updated_at: str
    expires_at: str
    turns: list[LessonTurn] = Field(default_factory=list)


class LessonStartRequest(WireModel):
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    expansion_ids: list[str] = Field(default_factory=list)
    speak: bool = False
    locale: str = "en"


class LessonSessionRequest(WireModel):
    session_id: str
    speak: bool = False
    locale: str = "en"


class LessonAskRequest(WireModel):
    session_id: str
    question: str = Field(min_length=1, max_length=2000)
    speak: bool = False
    locale: str = "en"


class EnsureVoiceRequest(WireModel):
    locale: str = "en"


class EnsureVoiceResponse(WireModel):
    ready: bool
    voice: str
    locale: str


class LessonActiveResponse(WireModel):
    session: LessonSession | None = None


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


class NoticeEvent(WireModel):
    """Code + params only. The frontend owns the sentence (and the language)."""

    type: Literal["notice"] = "notice"
    code: str
    params: dict[str, str] = Field(default_factory=dict)


class DoneEvent(WireModel):
    type: Literal["done"] = "done"
    answer_id: str
    groundedness: Groundedness


class ErrorEvent(WireModel):
    type: Literal["error"] = "error"
    code: str
    #: English log detail. The screen shows `code` translated.
    message: str


AssistantEvent = Annotated[
    StatusEvent
    | TranscriptEvent
    | SourcesEvent
    | TokenEvent
    | FigureEvent
    | AudioEvent
    | NoticeEvent
    | DoneEvent
    | ErrorEvent,
    Field(discriminator="type"),
]


class GameDocumentSummary(WireModel):
    doc_key: str = Field(pattern=DOC_KEY_PATTERN)
    document_kind: DocumentKind
    title: str
    chunk_count: int = 0
    indexed_at: str


class GameSummary(WireModel):
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    title: str
    chunk_count: int = 0
    document_kinds: list[DocumentKind] = Field(default_factory=list)
    indexed_at: str | None = None
    base_game_id: str | None = None
    documents: list[GameDocumentSummary] = Field(default_factory=list)


WarmStage = Literal["starting_assistant", "teaching_answers", "finding_rules"]


class HealthReport(WireModel):
    status: Literal["ok", "degraded"]
    components: dict[str, bool]
    models: dict[str, str]
    missing_models: list[str] = Field(default_factory=list)
    warm_stage: WarmStage | None = None


class GameCatalogueItem(WireModel):
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    title: str
    base_game_id: str | None = None


class RetrievalReloadResponse(WireModel):
    started: bool


IngestStage = Literal["saving", "reading", "drawing", "filing", "community", "indexing"]


class IngestProgressEvent(WireModel):
    type: Literal["ingest_progress"] = "ingest_progress"
    stage: IngestStage
    current: int | None = None
    total: int | None = None
    percent: int


class IngestDoneEvent(WireModel):
    type: Literal["ingest_done"] = "ingest_done"
    game: GameSummary


IngestEvent = Annotated[
    IngestProgressEvent | IngestDoneEvent | ErrorEvent,
    Field(discriminator="type"),
]
