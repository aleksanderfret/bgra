from __future__ import annotations

from pathlib import Path
from typing import Protocol, cast

from rag_engine.contract import DocumentKind
from rag_engine.retrieval.types import RetrievedChunk
from rag_engine.storage_paths import assert_doc_key, assert_game_id, index_dir

_TABLE = "chunks"


class _LanceQuery(Protocol):
    def where(self, predicate: str, prefilter: bool = False) -> _LanceQuery: ...

    def limit(self, n: int) -> _LanceQuery: ...

    def to_list(self) -> list[dict[str, object]]: ...


class _LanceTable(Protocol):
    def delete(self, predicate: str) -> None: ...

    def add(self, rows: list[dict[str, object]]) -> None: ...

    def create_fts_index(self, column: str, *, replace: bool = False) -> None: ...

    def search(self, query: object, query_type: str = "vector") -> _LanceQuery: ...

    def count_rows(self, predicate: str) -> int: ...

    def to_list(self) -> list[dict[str, object]]: ...


class _LanceDb(Protocol):
    def table_names(self) -> list[str]: ...

    def open_table(self, name: str) -> _LanceTable: ...

    def create_table(self, name: str, data: list[dict[str, object]]) -> _LanceTable: ...


def _in_clause(game_ids: list[str]) -> str:
    safe = [assert_game_id(game_id) for game_id in game_ids]
    return ", ".join(f"'{game_id}'" for game_id in safe)


class LanceDbIndex:
    def __init__(self, storage_dir: Path) -> None:
        import lancedb

        self._db = cast(_LanceDb, lancedb.connect(str(index_dir(storage_dir))))

    def _table(self) -> _LanceTable | None:
        if _TABLE not in self._db.table_names():
            return None
        return self._db.open_table(_TABLE)

    def delete_document(self, game_id: str, kind: DocumentKind, doc_key: str) -> None:
        table = self._table()
        if table is None:
            return
        assert_game_id(game_id)
        assert_doc_key(doc_key)
        table.delete(
            f"game_id = '{game_id}' AND document_kind = '{kind}' AND doc_key = '{doc_key}'"
        )

    def upsert(self, chunks: list[RetrievedChunk]) -> None:
        if not chunks:
            return
        rows = [_row(chunk) for chunk in chunks]
        table = self._table()
        if table is None:
            self._db.create_table(_TABLE, rows)
            table = self._db.open_table(_TABLE)
        else:
            table.add(rows)
        table.create_fts_index("text", replace=True)

    def search_vector(
        self,
        vector: list[float],
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        table = self._table()
        if table is None or not game_ids or not vector:
            return []
        results = (
            table.search(vector)
            .where(f"game_id IN ({_in_clause(game_ids)})", prefilter=True)
            .limit(limit)
            .to_list()
        )
        return [_from_row(row) for row in results]

    def search_text(
        self,
        query: str,
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        table = self._table()
        if table is None or not game_ids:
            return []
        try:
            results = (
                table.search(query, query_type="fts")
                .where(f"game_id IN ({_in_clause(game_ids)})", prefilter=True)
                .limit(limit)
                .to_list()
            )
        except Exception:
            return []
        return [_from_row(row) for row in results]

    def count_for_games(self, game_ids: list[str]) -> int:
        table = self._table()
        if table is None or not game_ids:
            return 0
        try:
            return table.count_rows(f"game_id IN ({_in_clause(game_ids)})")
        except Exception:
            rows = table.to_list()
            allowed = set(game_ids)
            return sum(1 for row in rows if row.get("game_id") in allowed)


def _row(chunk: RetrievedChunk) -> dict[str, object]:
    if chunk.vector is None:
        raise ValueError(f"Chunk {chunk.id} is missing a vector.")
    return {
        "id": chunk.id,
        "game_id": chunk.game_id,
        "document_kind": chunk.document_kind,
        "doc_key": chunk.doc_key,
        "document_title": chunk.document_title,
        "page": chunk.page,
        "text": chunk.text,
        "heading": chunk.heading,
        "image_url": chunk.image_url,
        "indexed_at": chunk.indexed_at,
        "vector": chunk.vector,
    }


def _from_row(row: dict[str, object]) -> RetrievedChunk:
    page = row.get("page")
    return RetrievedChunk(
        id=str(row["id"]),
        game_id=str(row["game_id"]),
        document_kind=row["document_kind"],  # type: ignore[arg-type]
        doc_key=str(row["doc_key"]),
        document_title=str(row.get("document_title") or ""),
        page=int(page) if isinstance(page, int) else None,
        text=str(row.get("text") or ""),
        heading=str(row.get("heading") or ""),
        image_url=str(row["image_url"]) if row.get("image_url") else None,
        indexed_at=str(row.get("indexed_at") or ""),
        score=0.0,
    )
