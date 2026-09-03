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
    chunks = chunk_markdown(markdown, game_id="azul", kind="rulebook")
    assert len(chunks) == 2
    assert chunks[0].heading == "Setup"
    assert chunks[0].page == 1
    assert chunks[0].image_url == "/static/assets/azul/p01.png"
    assert chunks[1].id == "azul:rulebook:p02:c00"
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
    assert (storage / "assets" / "azul" / "p01.png").is_file()
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
