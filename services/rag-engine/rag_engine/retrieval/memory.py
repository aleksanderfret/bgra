from rag_engine.contract import DocumentKind
from rag_engine.retrieval.types import RetrievedChunk


class MemoryIndex:
    def __init__(self) -> None:
        self.rows: dict[str, RetrievedChunk] = {}

    def delete_document(self, game_id: str, kind: DocumentKind, doc_key: str) -> None:
        stale = [
            chunk_id
            for chunk_id, chunk in self.rows.items()
            if chunk.game_id == game_id and chunk.document_kind == kind and chunk.doc_key == doc_key
        ]
        for chunk_id in stale:
            del self.rows[chunk_id]

    def upsert(self, chunks: list[RetrievedChunk]) -> None:
        for chunk in chunks:
            if chunk.vector is not None and self.rows:
                existing = next(iter(self.rows.values())).vector
                if existing is not None and len(chunk.vector) != len(existing):
                    raise ValueError(
                        f"Embedding length {len(chunk.vector)} does not match "
                        f"index {len(existing)}."
                    )
            self.rows[chunk.id] = chunk

    def search_vector(
        self,
        _vector: list[float],
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        return [chunk for chunk in self.rows.values() if chunk.game_id in game_ids][:limit]

    def search_text(
        self,
        query: str,
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        lowered = query.lower()
        hits = [
            chunk
            for chunk in self.rows.values()
            if chunk.game_id in game_ids and lowered in chunk.text.lower()
        ]
        return hits[:limit]

    def count_for_games(self, game_ids: list[str]) -> int:
        return sum(1 for chunk in self.rows.values() if chunk.game_id in game_ids)
