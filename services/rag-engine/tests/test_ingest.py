import json
from pathlib import Path

import pytest

from rag_engine.ingest.chunking import chunk_markdown
from rag_engine.ingest.pdf import PdfLimitError, assert_pdf_limits, extract_markdown
from rag_engine.ingest.pipeline import ingest_pdf, read_chunks_jsonl
from rag_engine.ingest.registry import load_games
from rag_engine.storage_paths import InvalidGameIdError, chunks_path


def _make_pdf(path: Path, pages: list[str]) -> Path:
    import pymupdf

    doc = pymupdf.open()  # type: ignore[no-untyped-call,unused-ignore]
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)  # type: ignore[no-untyped-call,unused-ignore]
    doc.close()  # type: ignore[no-untyped-call,unused-ignore]
    return path


def test_chunk_markdown_never_crosses_heading_boundary() -> None:
    markdown = """----- 1 -----
# Setup
Draw tiles.

----- 2 -----
# Turn
Play one tile.
"""
    chunks = chunk_markdown(
        markdown,
        game_id="azul",
        kind="rulebook",
        doc_key="main",
        document_title="Rulebook",
    )
    assert len(chunks) == 2
    assert chunks[0].heading == "Setup"
    assert chunks[0].page == 1
    assert chunks[0].doc_key == "main"
    assert chunks[0].image_url == "/static/assets/azul/documents/rulebook/main/p01.png"
    assert chunks[1].id == "azul:rulebook:main:p02:c00"
    assert "Play one tile" in chunks[1].text


def test_ingest_pdf_writes_chunks_pngs_and_registry(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    pdf = _make_pdf(tmp_path / "demo.pdf", ["# Setup\n\nDraw tiles.", "# Turn\n\nPlay one."])

    chunks = ingest_pdf(
        storage,
        game_id="azul",
        kind="rulebook",
        pdf_path=pdf,
        title="Azul",
    )

    assert len(chunks) >= 1
    assert (storage / "assets" / "azul" / "documents" / "rulebook" / "main" / "p01.png").is_file()
    assert chunks_path(storage, "azul", "rulebook", "main").is_file()
    games = load_games(storage)
    assert len(games) == 1
    assert games[0].game_id == "azul"
    assert games[0].title == "Azul"
    assert games[0].chunk_count == len(chunks)
    assert "rulebook" in games[0].document_kinds


def test_reingest_replaces_chunk_count(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    pdf1 = _make_pdf(tmp_path / "a.pdf", ["# A\n\nOne."])
    pdf2 = _make_pdf(tmp_path / "b.pdf", ["# A\n\nOne.", "# B\n\nTwo."])

    first = ingest_pdf(storage, game_id="azul", kind="rulebook", pdf_path=pdf1, title="Azul")
    second = ingest_pdf(storage, game_id="azul", kind="rulebook", pdf_path=pdf2, title="Azul")

    games = load_games(storage)
    assert games[0].chunk_count == len(second)
    assert games[0].chunk_count != len(first) or len(first) == len(second)
    on_disk = read_chunks_jsonl(chunks_path(storage, "azul", "rulebook", "main"))
    assert len(on_disk) == len(second)


def test_second_document_keeps_distinct_ids_and_pages(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    core = _make_pdf(tmp_path / "core.pdf", ["# Core\n\nSetup."])
    solo = _make_pdf(tmp_path / "solo.pdf", ["# Solo\n\nPlay alone."])

    ingest_pdf(
        storage,
        game_id="azul",
        kind="rulebook",
        pdf_path=core,
        title="Azul",
        document_title="Rulebook",
        doc_key="main",
    )
    ingest_pdf(
        storage,
        game_id="azul",
        kind="rulebook",
        pdf_path=solo,
        title="Azul",
        document_title="Solo mode",
        doc_key="solo",
    )

    main_chunks = read_chunks_jsonl(chunks_path(storage, "azul", "rulebook", "main"))
    solo_chunks = read_chunks_jsonl(chunks_path(storage, "azul", "rulebook", "solo"))
    assert main_chunks[0].id.startswith("azul:rulebook:main:")
    assert solo_chunks[0].id.startswith("azul:rulebook:solo:")
    assert (storage / "assets" / "azul" / "documents" / "rulebook" / "main" / "p01.png").is_file()
    assert (storage / "assets" / "azul" / "documents" / "rulebook" / "solo" / "p01.png").is_file()
    games = load_games(storage)
    titles = {doc.title for doc in games[0].documents}
    assert titles == {"Rulebook", "Solo mode"}


def test_legacy_flat_pages_migrate_into_main(tmp_path: Path) -> None:
    from rag_engine.ingest.models import ChunkRecord
    from rag_engine.ingest.pipeline import migrate_legacy_flat_pages, write_chunks_jsonl

    storage = tmp_path / "storage"
    assets = storage / "assets" / "azul"
    assets.mkdir(parents=True)
    (assets / "p01.png").write_bytes(b"png")
    write_chunks_jsonl(
        assets / "chunks.jsonl",
        [
            ChunkRecord(
                id="azul:rulebook:p01:c00",
                game_id="azul",
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                heading="Setup",
                page=1,
                text="Setup.",
                image_url="/static/assets/azul/p01.png",
            )
        ],
    )
    migrate_legacy_flat_pages(storage, "azul")
    dest = storage / "assets" / "azul" / "documents" / "rulebook" / "main"
    assert (dest / "p01.png").is_file()
    assert not (assets / "p01.png").exists()
    migrated = read_chunks_jsonl(dest / "chunks.jsonl")
    assert migrated[0].image_url == "/static/assets/azul/documents/rulebook/main/p01.png"


def test_read_chunks_jsonl_upgrades_records_without_doc_key(tmp_path: Path) -> None:
    path = tmp_path / "rulebook" / "main" / "chunks.jsonl"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "id": "world-order:rulebook:p01:c00",
                "game_id": "world-order",
                "document_kind": "rulebook",
                "page": 1,
                "text": "INSTRUKCJA",
                "image_url": "/static/assets/world-order/p01.png",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    chunks = read_chunks_jsonl(path)
    assert chunks[0].doc_key == "main"
    assert chunks[0].id == "world-order:rulebook:main:p01:c00"
    assert chunks[0].image_url == ("/static/assets/world-order/documents/rulebook/main/p01.png")


def test_bad_game_id_writes_nothing(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    pdf = _make_pdf(tmp_path / "demo.pdf", ["Hello"])

    with pytest.raises(InvalidGameIdError):
        ingest_pdf(storage, game_id="../x", kind="rulebook", pdf_path=pdf)

    assert not (storage / "assets").exists()
    assert load_games(storage) == []


def test_pdf_page_limit(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    pages = [f"Page {i}" for i in range(201)]
    pdf = _make_pdf(tmp_path / "big.pdf", pages)

    with pytest.raises(PdfLimitError):
        extract_markdown(pdf)


def test_render_page_pngs_steps_dpi_down_when_png_is_heavy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rag_engine.ingest import pdf as pdf_mod

    pdf = _make_pdf(tmp_path / "demo.pdf", ["Cover art"])
    out = tmp_path / "pages"
    calls: list[int] = []

    def fake_page_png(_page: object, dpi: int) -> bytes:
        calls.append(dpi)
        if dpi > 100:
            return b"x" * (pdf_mod.MAX_PNG_BYTES + 1)
        return b"png-ok"

    monkeypatch.setattr(pdf_mod, "_page_png_bytes", fake_page_png)
    written = pdf_mod.render_page_pngs(pdf, out)

    assert calls == [150, 120, 100]
    assert len(written) == 1
    assert written[0].read_bytes() == b"png-ok"


def test_assert_pdf_limits_missing_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        assert_pdf_limits(tmp_path / "missing.pdf")


def test_cli_rejects_bad_game(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from rag_engine.ingest.__main__ import main

    storage = tmp_path / "storage"
    storage.mkdir()
    pdf = _make_pdf(tmp_path / "demo.pdf", ["Hi"])
    monkeypatch.setenv("BGA_STORAGE_DIR", str(storage))
    from rag_engine import settings as settings_mod

    settings_mod.get_settings.cache_clear()

    code = main(["add", "--game", "Azul", "--kind", "rulebook", str(pdf)])
    assert code == 2
    assert load_games(storage) == []
    settings_mod.get_settings.cache_clear()
