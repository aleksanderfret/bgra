from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Protocol, cast

from rag_engine.contract import DocumentKind
from rag_engine.retrieval.types import RetrievedChunk
from rag_engine.storage_paths import assert_doc_key, assert_game_id, index_dir

logger = logging.getLogger(__name__)

_TABLE = "chunks"


class _LanceQuery(Protocol):
    def where(self, predicate: str, prefilter: bool = False) -> _LanceQuery: ...

    def limit(self, n: int) -> _LanceQuery: ...

    def to_list(self) -> list[dict[str, object]]: ...


class _LanceSchemaField(Protocol):
    @property
    def name(self) -> str: ...


class _LanceSchema(Protocol):
    def __iter__(self) -> Iterator[_LanceSchemaField]: ...


class _LanceArrowColumn(Protocol):
    def to_pylist(self) -> list[object]: ...


class _LanceArrow(Protocol):
    def __len__(self) -> int: ...

    def column(self, name: str) -> _LanceArrowColumn: ...


class _LanceTable(Protocol):
    def delete(self, predicate: str) -> None: ...

    def add(self, rows: list[dict[str, object]]) -> None: ...

    def create_fts_index(self, column: str, *, replace: bool = False) -> None: ...

    def search(self, query: object = None, query_type: str = "vector") -> _LanceQuery: ...

    def count_rows(self, predicate: str | None = None) -> int: ...

    def add_columns(self, transforms: dict[str, str]) -> object: ...

    def to_arrow(self) -> _LanceArrow: ...

    @property
    def schema(self) -> _LanceSchema: ...


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
            self._ensure_section_columns(table)
            table.add(rows)
        table.create_fts_index("text", replace=True)

    def _ensure_section_columns(self, table: _LanceTable) -> None:
        """Grow an older on-disk table that predates section_id / block_kind."""
        names = {field.name for field in table.schema}
        missing: dict[str, str] = {}
        if "section_id" not in names:
            missing["section_id"] = "cast('' as string)"
        if "block_kind" not in names:
            missing["block_kind"] = "cast('rule' as string)"
        if not missing:
            return
        table.add_columns(missing)

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
            logger.exception("Lance count_rows failed; scanning the arrow table.")
            try:
                arrow = table.to_arrow()
                values = arrow.column("game_id").to_pylist()
                allowed = set(game_ids)
                return sum(1 for value in values if value in allowed)
            except Exception:
                logger.exception("Lance arrow scan failed while counting games.")
                return 0

    def find_by_section(
        self,
        game_ids: list[str],
        *,
        doc_key: str,
        section_id: str,
        limit: int,
    ) -> list[RetrievedChunk]:
        table = self._table()
        if table is None or not game_ids or not section_id:
            return []
        assert_doc_key(doc_key)
        safe_section = section_id.replace("'", "''")
        try:
            results = (
                table.search()
                .where(
                    f"game_id IN ({_in_clause(game_ids)}) AND doc_key = '{doc_key}' "
                    f"AND section_id = '{safe_section}' AND block_kind != 'catalogue'",
                    prefilter=True,
                )
                .limit(max(limit * 4, limit))
                .to_list()
            )
        except Exception:
            logger.exception(
                "Lance find_by_section failed for doc_key=%s section_id=%s",
                doc_key,
                section_id,
            )
            return []
        hits = [_from_row(row) for row in results]
        hits.sort(key=lambda chunk: (chunk.page is None, chunk.page or 0, chunk.id))
        return hits[:limit]


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
        "section_id": chunk.section_id,
        "block_kind": chunk.block_kind,
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
        section_id=str(row.get("section_id") or ""),
        block_kind=row.get("block_kind") or "rule",  # type: ignore[arg-type]
    )
