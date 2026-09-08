from __future__ import annotations

import json
from pathlib import Path

from rag_engine.ingest.layout import INGEST_LAYOUT_VERSION
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pipeline import (
    ensure_layout_ingest,
    ensure_section_maps,
    read_chunks_jsonl,
    write_chunks_jsonl,
    write_document_manifest,
)
from rag_engine.ingest.registry import upsert_game
from rag_engine.ingest.section_map import SECTION_MAP_VERSION
from rag_engine.storage_paths import (
    CHUNKS_FILE_NAME,
    MANIFEST_FILE_NAME,
    SOURCE_PDF_NAME,
    document_dir,
)


def _rule_chunk(*, heading: str, page: int, index: int) -> ChunkRecord:
    return ChunkRecord(
        id=f"azul:rulebook:main:p{page:02d}:c{index:02d}",
        game_id="azul",
        document_kind="rulebook",
        doc_key="main",
        document_title="Rulebook",
        page=page,
        text=f"Body for {heading}.",
        heading=heading,
        image_url=f"/static/assets/azul/documents/rulebook/main/p{page:02d}.png",
    )


def _seed_document(storage: Path, *, with_pdf: bool) -> Path:
    doc = document_dir(storage, "azul", "rulebook", "main")
    doc.mkdir(parents=True, exist_ok=True)
    chunks = [
        _rule_chunk(heading="Setup", page=1, index=0),
        _rule_chunk(heading="Trading", page=2, index=0),
    ]
    write_chunks_jsonl(doc / CHUNKS_FILE_NAME, chunks)
    write_document_manifest(
        doc / MANIFEST_FILE_NAME,
        title="Rulebook",
        kind="rulebook",
        indexed_at="2026-01-01T00:00:00Z",
        section_map_version=0,
        ingest_layout_version=0,
    )
    (doc / "p01.png").write_bytes(b"png")
    if with_pdf:
        # Existence gate only — layout extract is not reached when we assert
        # section-map skip or version-current skip.
        (doc / SOURCE_PDF_NAME).write_bytes(b"%PDF-1.4")
    upsert_game(
        storage,
        game_id="azul",
        title="Azul",
        chunk_count=len(chunks),
        document_kinds=["rulebook"],
        documents=[],
    )
    return doc


def test_ensure_section_maps_is_idempotent_without_pdf(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    doc = _seed_document(storage, with_pdf=False)

    first = ensure_section_maps(storage)
    assert first == 1
    manifest = json.loads((doc / MANIFEST_FILE_NAME).read_text(encoding="utf-8"))
    assert manifest["sectionMapVersion"] == SECTION_MAP_VERSION
    chunks = read_chunks_jsonl(doc / CHUNKS_FILE_NAME)
    assert any(chunk.block_kind == "catalogue" for chunk in chunks)
    assert (doc / "p01.png").read_bytes() == b"png"

    second = ensure_section_maps(storage)
    assert second == 0


def test_ensure_section_maps_skips_pdf_docs_pending_layout(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    doc = _seed_document(storage, with_pdf=True)

    rewritten = ensure_section_maps(storage)
    assert rewritten == 0
    manifest = json.loads((doc / MANIFEST_FILE_NAME).read_text(encoding="utf-8"))
    assert manifest.get("sectionMapVersion", 0) == 0
    chunks = read_chunks_jsonl(doc / CHUNKS_FILE_NAME)
    assert all(chunk.block_kind != "catalogue" for chunk in chunks)


def test_ensure_layout_ingest_skips_without_source_pdf(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    _seed_document(storage, with_pdf=False)

    assert ensure_layout_ingest(storage) == 0


def test_ensure_layout_ingest_is_idempotent_when_version_current(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    doc = _seed_document(storage, with_pdf=True)
    write_document_manifest(
        doc / MANIFEST_FILE_NAME,
        title="Rulebook",
        kind="rulebook",
        indexed_at="2026-01-01T00:00:00Z",
        section_map_version=SECTION_MAP_VERSION,
        ingest_layout_version=INGEST_LAYOUT_VERSION,
    )

    assert ensure_layout_ingest(storage) == 0
