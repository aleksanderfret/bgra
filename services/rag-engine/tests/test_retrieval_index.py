from rag_engine.retrieval.memory import MemoryIndex
from rag_engine.retrieval.types import RetrievedChunk


def _chunk(chunk_id: str, page: int) -> RetrievedChunk:
    return RetrievedChunk(
        id=chunk_id,
        game_id="azul",
        document_kind="rulebook",
        doc_key="main",
        document_title="Azul",
        page=page,
        text=f"Page {page}",
        indexed_at="2026-01-01T00:00:00Z",
        vector=[0.1, 0.2],
    )


def test_delete_document_then_upsert_drops_old_pages() -> None:
    index = MemoryIndex()
    index.upsert(
        [_chunk("azul:rulebook:main:p01:c00", 1), _chunk("azul:rulebook:main:p12:c00", 12)]
    )
    index.delete_document("azul", "rulebook", "main")
    index.upsert([_chunk("azul:rulebook:main:p01:c00", 1)])
    remaining = index.search_text("Page", ["azul"], limit=10)
    assert [hit.page for hit in remaining] == [1]
