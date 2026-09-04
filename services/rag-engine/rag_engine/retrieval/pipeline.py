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
    scores = reranker.score(question, ordered)
    scored: list[RetrievedChunk] = []
    for chunk, score in zip(ordered, scores, strict=True):
        if score < min_relevance_score:
            continue
        scored.append(chunk.model_copy(update={"score": score}))
    scored.sort(key=lambda chunk: chunk.score, reverse=True)
    return scored[:top_k]
