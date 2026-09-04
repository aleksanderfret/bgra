from pydantic import BaseModel

from rag_engine.contract import DocumentKind
from rag_engine.ingest.models import ChunkRecord


class RetrievedChunk(BaseModel):
    id: str
    game_id: str
    document_kind: DocumentKind
    doc_key: str
    document_title: str = ""
    page: int | None = None
    text: str
    heading: str = ""
    image_url: str | None = None
    indexed_at: str = ""
    score: float = 0.0
    vector: list[float] | None = None

    @classmethod
    def from_record(
        cls,
        record: ChunkRecord,
        *,
        indexed_at: str,
        score: float = 0.0,
    ) -> RetrievedChunk:
        return cls(
            id=record.id,
            game_id=record.game_id,
            document_kind=record.document_kind,
            doc_key=record.doc_key,
            document_title=record.document_title,
            page=record.page,
            text=record.text,
            heading=record.heading,
            image_url=record.image_url,
            indexed_at=indexed_at,
            score=score,
        )
