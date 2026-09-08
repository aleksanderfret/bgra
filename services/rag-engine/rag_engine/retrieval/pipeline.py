import asyncio
import re
from typing import Protocol

from rag_engine.contract import DocumentKind
from rag_engine.ingest.chunking import clean_heading
from rag_engine.ingest.models import BLOCK_KIND_CATALOGUE, BLOCK_KIND_RULE
from rag_engine.ingest.section_map import section_id_for
from rag_engine.retrieval.fuse import reciprocal_rank_fusion
from rag_engine.retrieval.types import RetrievedChunk

#: Do not drag a whole long section in for one incidental hit.
_MAX_SECTION_CHUNKS_TO_EXPAND = 6

_CATALOGUE_LINE_RE = re.compile(r"^(?:page\s+\d+:\s*)?(.+)$", re.IGNORECASE)


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class ChunkIndex(Protocol):
    def search_vector(
        self,
        vector: list[float],
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]: ...

    def search_text(
        self,
        query: str,
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]: ...

    def find_by_section(
        self,
        game_ids: list[str],
        *,
        doc_key: str,
        section_id: str,
        limit: int,
    ) -> list[RetrievedChunk]: ...

    def count_for_games(self, game_ids: list[str]) -> int: ...

    def delete_document(self, game_id: str, kind: DocumentKind, doc_key: str) -> None: ...

    def upsert(self, chunks: list[RetrievedChunk]) -> None: ...


class Reranker(Protocol):
    def score(self, query: str, passages: list[RetrievedChunk]) -> list[float]: ...


def _in_game_set(chunk: RetrievedChunk, game_ids: list[str]) -> bool:
    return chunk.game_id in game_ids


def keep_relevant(
    scored: list[tuple[RetrievedChunk, float]],
    *,
    floor: float,
    share_of_best: float,
) -> list[RetrievedChunk]:
    """Drop passages the question is not really about.

    A cross-encoder answers "how fully does this passage settle the question",
    not "is this on topic", so its scores are not comparable between questions.
    The same correct passage of the rulebook scored 0.77 for "what does the Trade
    action do and how many transactions can I make" and 0.13 for "what does the
    Trade action do" — one fixed cut-off therefore either refuses short questions
    or lets noise through. So the floor only has to reject a question about
    something else entirely (measured at 0.0003), and what counts as noise is
    decided relative to the best passage found for this question.
    """
    best = max((score for _, score in scored), default=0.0)
    if best < floor:
        return []
    cut = best * share_of_best
    return [chunk.model_copy(update={"score": score}) for chunk, score in scored if score >= cut]


def _headings_from_catalogue(text: str) -> list[str]:
    headings: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.lower().startswith("section catalogue"):
            continue
        match = _CATALOGUE_LINE_RE.match(line)
        if match is None:
            continue
        heading = clean_heading(match.group(1))
        if heading:
            headings.append(heading)
    return headings


def expand_siblings(
    kept: list[RetrievedChunk],
    *,
    index: ChunkIndex,
    game_ids: list[str],
    top_k: int,
) -> list[RetrievedChunk]:
    """Fill gaps inside a kept section / catalogue, without exceeding top_k.

    Passages that already cleared the relevance filter always outrank expansions,
    but siblings of a high-scoring hit are taken before lower-scoring unrelated
    hits — otherwise a list question that kept six weak pages never gets the
    second half of its table of contents.

    A catalogue chunk stays in the list for the model (it is the complete list);
    the ask path strips it from the player-facing sources only.
    """
    if not kept or top_k <= 0:
        return []

    ordered: list[RetrievedChunk] = []
    seen: set[str] = set()

    def _append(chunk: RetrievedChunk, *, as_expansion: bool) -> None:
        if len(ordered) >= top_k or chunk.id in seen:
            return
        ordered.append(chunk if not as_expansion else chunk.model_copy(update={"score": 0.0}))
        seen.add(chunk.id)

    for hit in kept:
        if len(ordered) >= top_k:
            break
        _append(hit, as_expansion=False)
        if hit.block_kind == BLOCK_KIND_CATALOGUE:
            for heading in _headings_from_catalogue(hit.text):
                if len(ordered) >= top_k:
                    break
                section_id = section_id_for(heading)
                siblings = index.find_by_section(
                    game_ids,
                    doc_key=hit.doc_key,
                    section_id=section_id,
                    limit=_MAX_SECTION_CHUNKS_TO_EXPAND + 1,
                )
                if len(siblings) > _MAX_SECTION_CHUNKS_TO_EXPAND:
                    # Long sections: one representative chunk is enough; the
                    # catalogue already named the section for the model.
                    if siblings:
                        _append(siblings[0], as_expansion=True)
                    continue
                for sibling in siblings:
                    _append(sibling, as_expansion=True)
            continue
        if hit.block_kind != BLOCK_KIND_RULE or not hit.section_id:
            continue
        siblings = index.find_by_section(
            game_ids,
            doc_key=hit.doc_key,
            section_id=hit.section_id,
            limit=_MAX_SECTION_CHUNKS_TO_EXPAND + 1,
        )
        if len(siblings) > _MAX_SECTION_CHUNKS_TO_EXPAND:
            continue
        for sibling in siblings:
            _append(sibling, as_expansion=True)

    return ordered[:top_k]


def player_facing_hits(hits: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Catalogue chunks are an index aid — not a page the player can open."""
    return [hit for hit in hits if hit.block_kind != BLOCK_KIND_CATALOGUE]


async def retrieve(
    *,
    question: str,
    game_ids: list[str],
    embedder: Embedder,
    index: ChunkIndex,
    reranker: Reranker,
    candidates: int,
    top_k: int,
    min_relevance_score: float,
    relevance_share_of_best: float,
) -> list[RetrievedChunk]:
    vectors = await embedder.embed([question])
    query_vector = vectors[0] if vectors else []
    vector_hits = [
        hit
        for hit in index.search_vector(query_vector, game_ids, candidates)
        if _in_game_set(hit, game_ids)
    ]
    text_hits = [
        hit
        for hit in index.search_text(question, game_ids, candidates)
        if _in_game_set(hit, game_ids)
    ]
    by_id = {hit.id: hit for hit in text_hits}
    by_id.update({hit.id: hit for hit in vector_hits})
    fused_ids = reciprocal_rank_fusion(
        [[hit.id for hit in vector_hits], [hit.id for hit in text_hits]],
        limit=candidates,
    )
    ordered = [by_id[chunk_id] for chunk_id in fused_ids if chunk_id in by_id]
    if not ordered:
        return []
    scores = await asyncio.to_thread(reranker.score, question, ordered)
    relevant = keep_relevant(
        list(zip(ordered, scores, strict=True)),
        floor=min_relevance_score,
        share_of_best=relevance_share_of_best,
    )
    relevant.sort(key=lambda chunk: chunk.score, reverse=True)
    if not relevant:
        return []
    return expand_siblings(relevant, index=index, game_ids=game_ids, top_k=top_k)
