import asyncio
from typing import Protocol

from rag_engine.contract import DocumentKind
from rag_engine.retrieval.fuse import reciprocal_rank_fusion
from rag_engine.retrieval.types import RetrievedChunk


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
    return relevant[:top_k]
