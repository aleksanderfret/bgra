"""On-disk chunk records for Stage 2 (no vectors yet — Stage 3 adds them)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from rag_engine.contract import DOC_KEY_PATTERN, GAME_ID_PATTERN, DocumentKind


class ChunkRecord(BaseModel):
    id: str
    game_id: str = Field(pattern=GAME_ID_PATTERN)
    document_kind: DocumentKind
    doc_key: str = Field(pattern=DOC_KEY_PATTERN)
    document_title: str = ""
    page: int | None = None
    text: str
    heading: str = ""
    image_url: str | None = None


def chunk_id_for_page(
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    page: int,
    chunk_index: int,
) -> str:
    return f"{game_id}:{kind}:{doc_key}:p{page:02d}:c{chunk_index:02d}"


def chunk_id_for_transcript(
    game_id: str,
    video_id: str,
    chunk_index: int,
) -> str:
    return f"{game_id}:video_transcript:{video_id}:c{chunk_index:02d}"


def chunk_id_for_faq(game_id: str, doc_key: str, chunk_index: int) -> str:
    return f"{game_id}:faq:{doc_key}:c{chunk_index:02d}"
