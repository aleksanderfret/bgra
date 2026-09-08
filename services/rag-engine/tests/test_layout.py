from __future__ import annotations

from pathlib import Path

import pytest

from rag_engine.ingest.layout import (
    _Block,
    blocks_to_sections,
    cluster_columns,
    order_page_blocks,
    split_bands,
)


def test_split_bands_separates_upper_and_lower_rows() -> None:
    # Two rows of text with a large gap (illustration band) between them.
    blocks = [
        _Block(10, 10, 100, 40, "upper-left"),
        _Block(200, 10, 300, 40, "upper-right"),
        _Block(10, 400, 100, 430, "lower-left"),
        _Block(200, 400, 300, 430, "lower-right"),
    ]
    bands = split_bands(blocks, page_height=500)
    assert len(bands) == 2
    assert {block.text for block in bands[0]} == {"upper-left", "upper-right"}
    assert {block.text for block in bands[1]} == {"lower-left", "lower-right"}


def test_cluster_columns_orders_left_to_right() -> None:
    blocks = [
        _Block(300, 10, 400, 40, "right"),
        _Block(10, 10, 100, 40, "left"),
        _Block(150, 10, 250, 40, "middle"),
    ]
    columns = cluster_columns(blocks, page_width=420)
    assert [column[0].text for column in columns] == ["left", "middle", "right"]


def test_order_page_reads_upper_row_fully_before_lower_row() -> None:
    blocks = [
        _Block(10, 10, 100, 40, "A-left"),
        _Block(200, 10, 300, 40, "A-right"),
        _Block(10, 400, 100, 430, "B-left"),
        _Block(200, 400, 300, 430, "B-right"),
    ]
    ordered = order_page_blocks(blocks, page_width=320, page_height=500)
    assert [block.text for block in ordered] == ["A-left", "A-right", "B-left", "B-right"]


def test_example_keeps_parent_rule_heading() -> None:
    blocks = [
        _Block(10, 10, 200, 30, "Wywołanie rewolucji", kind="rule"),
        _Block(10, 40, 200, 120, "Zmiana ustroju kosztuje wszystkie akcje.", kind="rule"),
        _Block(
            10,
            140,
            200,
            220,
            "Przykład\nAby wprowadzić Monarchię, wydajesz wszystkie akcje.",
            kind="example",
        ),
    ]
    sections = blocks_to_sections(13, blocks)
    assert sections[0].heading == "Wywołanie rewolucji"
    assert sections[0].block_kind == "rule"
    example = next(section for section in sections if section.block_kind == "example")
    assert example.heading == "Wywołanie rewolucji"
    assert "Monarchię" in example.text
    assert example.heading.casefold() != "przykład"


def test_through_the_ages_handbook_page_order() -> None:
    pdf = Path("storage/assets/cywilizacja-poprzez-wieki/documents/rulebook/handbook/source.pdf")
    if not pdf.is_file():
        pytest.skip("Through the Ages handbook PDF is not in local storage")

    from rag_engine.ingest.layout import extract_layout_sections

    sections = extract_layout_sections(pdf)
    by_page: dict[int, list[str]] = {}
    for section in sections:
        if section.heading:
            by_page.setdefault(section.page, []).append(section.heading)

    p3 = " | ".join(by_page.get(3, [])).casefold()
    assert p3.index("farm") < p3.index("budynk") < p3.index("ery")

    p9 = " | ".join(by_page.get(9, [])).casefold()
    assert "limit" in p9
    assert p9.index("limit") < p9.index("zwiększenie") or p9.index("limit") < p9.index("populac")

    orphan_examples = [
        section
        for section in sections
        if section.page == 13 and section.heading.casefold() in {"przykład", "przykład."}
    ]
    assert orphan_examples == []


def _tiny_rulebook(path: Path) -> Path:
    import pymupdf

    document = pymupdf.open()  # type: ignore[no-untyped-call,unused-ignore]
    page = document.new_page()
    page.insert_text((72, 72), "# Setup\n\nDraw tiles.")
    path.parent.mkdir(parents=True, exist_ok=True)
    document.save(path)  # type: ignore[no-untyped-call,unused-ignore]
    document.close()  # type: ignore[no-untyped-call,unused-ignore]
    return path


def test_extract_pdf_chunks_falls_back_when_layout_exceeds_time_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rag_engine.ingest.layout import LayoutTimeoutError, extract_pdf_chunks

    pdf = _tiny_rulebook(tmp_path / "demo.pdf")

    def _timeout(_pdf_path: Path, *, deadline: float | None = None) -> list[object]:
        raise LayoutTimeoutError("budget")

    monkeypatch.setattr("rag_engine.ingest.layout.extract_layout_sections", _timeout)
    chunks, reader = extract_pdf_chunks(
        pdf,
        game_id="azul",
        kind="rulebook",
        doc_key="main",
        document_title="Rulebook",
        time_budget_seconds=1.0,
    )

    assert reader == "pymupdf4llm"
    assert any(chunk.text for chunk in chunks)
