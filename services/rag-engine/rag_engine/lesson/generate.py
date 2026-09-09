"""Load passages for a syllabus unit and fall back to retrieval when needed."""

from __future__ import annotations

from pathlib import Path

from rag_engine.contract import LessonSyllabusUnit
from rag_engine.ingest.models import BLOCK_KIND_CATALOGUE, ChunkRecord
from rag_engine.lesson.documents import iter_document_chunks
from rag_engine.retrieval.pipeline import ChunkIndex, Embedder, Reranker, retrieve
from rag_engine.retrieval.types import RetrievedChunk


def parse_section_ref(ref: str) -> tuple[str, str, str] | None:
    """Parse `gameId/docKey/sectionId`. Returns None when the shape is wrong."""
    parts = ref.split("/", 2)
    if len(parts) != 3:
        return None
    game_id, doc_key, section_id = parts
    if not game_id or not doc_key or not section_id:
        return None
    return game_id, doc_key, section_id


def chunks_for_unit(
    storage_dir: Path,
    unit: LessonSyllabusUnit,
    game_ids: list[str],
) -> list[ChunkRecord]:
    """Load on-disk chunks whose section_id/doc_key/game_id match unit.section_refs."""
    wanted: set[tuple[str, str, str]] = set()
    for ref in unit.section_refs:
        parsed = parse_section_ref(ref)
        if parsed is None:
            continue
        wanted.add(parsed)
    if not wanted:
        return []

    game_set = set(game_ids)
    matched: list[ChunkRecord] = []
    seen_ids: set[str] = set()
    for chunk in iter_document_chunks(storage_dir, game_ids):
        if chunk.game_id not in game_set:
            continue
        if chunk.block_kind == BLOCK_KIND_CATALOGUE:
            continue
        key = (chunk.game_id, chunk.doc_key, chunk.section_id)
        if key not in wanted:
            continue
        if chunk.id in seen_ids:
            continue
        seen_ids.add(chunk.id)
        matched.append(chunk)
    return matched


def records_to_retrieved(records: list[ChunkRecord]) -> list[RetrievedChunk]:
    return [RetrievedChunk.from_record(record, indexed_at="") for record in records]


def retrieval_question_for_unit(unit: LessonSyllabusUnit) -> str:
    """Fallback search text when section_refs have no on-disk chunks."""
    parts = [unit.title.strip()]
    for ref in unit.section_refs:
        parsed = parse_section_ref(ref)
        if parsed is not None:
            parts.append(parsed[2].replace("-", " "))
    return " ".join(part for part in parts if part)


async def hits_for_unit(
    *,
    storage_dir: Path,
    unit: LessonSyllabusUnit,
    game_ids: list[str],
    embedder: Embedder,
    index: ChunkIndex,
    reranker: Reranker,
    candidates: int,
    top_k: int,
    min_relevance_score: float,
    relevance_share_of_best: float,
) -> list[RetrievedChunk]:
    """Prefer disk chunks for section_refs; otherwise retrieve like /ask."""
    disk = chunks_for_unit(storage_dir, unit, game_ids)
    if disk:
        return records_to_retrieved(disk)

    return await retrieve(
        question=retrieval_question_for_unit(unit),
        game_ids=game_ids,
        embedder=embedder,
        index=index,
        reranker=reranker,
        candidates=candidates,
        top_k=top_k,
        min_relevance_score=min_relevance_score,
        relevance_share_of_best=relevance_share_of_best,
    )
