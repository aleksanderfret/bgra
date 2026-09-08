"""Geometry-based PDF reading order for dense multi-column rulebooks.

`pymupdf4llm` (even with its layout engine) still reads Through the Ages handbook
pages right-to-left in a band and drops callouts into the wrong column. This
module orders text blocks by horizontal bands (top → bottom), then columns
(left → right), then vertical position — and marks example/note callouts so
they keep the neighbouring rule's heading instead of becoming orphan
``Przykład`` sections.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from rag_engine.contract import DocumentKind
from rag_engine.ingest.chunking import clean_heading, split_section_text
from rag_engine.ingest.models import (
    BLOCK_KIND_RULE,
    BlockKind,
    ChunkRecord,
    chunk_id_for_page,
)
from rag_engine.ingest.section_map import build_catalogue_chunks, enrich_chunks
from rag_engine.storage_paths import page_image_url

logger = logging.getLogger(__name__)

#: Persist on ``manifest.json``; bump when the reader changes enough to re-ingest.
INGEST_LAYOUT_VERSION = 1

#: Leave headroom under the Next.js ingest proxy's ``maxDuration = 300``.
LAYOUT_TIME_BUDGET_SECONDS = 180.0

_EXAMPLE_RE = re.compile(r"^\s*przykład\b", re.IGNORECASE)
_NOTE_RE = re.compile(r"^\s*(uwaga|wskazówka|note|tip)\b[!.,:]?\s*", re.IGNORECASE)
_HEADING_LIKE_RE = re.compile(
    r"^(technologie|ery\b|ustrój|wskaźnik|karta pomocy|wzięcie|zwiększenie|"
    r"zapłata|nowy robotnik|limit |wywołanie|ulepszenie|podsumowanie|"
    r"faza |runda |przygotowanie)",
    re.IGNORECASE,
)


class LayoutTimeoutError(TimeoutError):
    pass


@dataclass(frozen=True)
class _Block:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    kind: BlockKind = BLOCK_KIND_RULE

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass(frozen=True)
class LayoutSection:
    page: int
    heading: str
    text: str
    block_kind: BlockKind


def _page_blocks(page: object) -> list[_Block]:
    raw = page.get_text("dict")  # type: ignore[attr-defined]
    blocks: list[_Block] = []
    for block in raw.get("blocks", []):
        if block.get("type") != 0:
            continue
        x0, y0, x1, y1 = block["bbox"]
        lines: list[str] = []
        for line in block.get("lines", []):
            line_text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if line_text:
                lines.append(line_text)
        text = "\n".join(lines).strip()
        if len(text) < 8:
            continue
        blocks.append(_Block(float(x0), float(y0), float(x1), float(y1), text))
    return blocks


def _callout_rects(page: object) -> list[tuple[float, float, float, float]]:
    """Filled drawings that look like callout boxes, not full-page backgrounds."""
    rects: list[tuple[float, float, float, float]] = []
    try:
        drawings = page.get_drawings()  # type: ignore[attr-defined]
    except Exception:
        return rects
    page_rect = page.rect  # type: ignore[attr-defined]
    min_w = page_rect.width * 0.15
    max_w = page_rect.width * 0.55
    min_h = 36.0
    max_h = page_rect.height * 0.35
    for drawing in drawings:
        fill = drawing.get("fill")
        rect = drawing.get("rect")
        if not fill or rect is None:
            continue
        if not (min_w <= rect.width <= max_w and min_h <= rect.height <= max_h):
            continue
        rects.append((float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)))
    return rects


def _inside(block: _Block, rect: tuple[float, float, float, float]) -> bool:
    x0, y0, x1, y1 = rect
    return x0 - 2 <= block.cx <= x1 + 2 and y0 - 2 <= block.cy <= y1 + 2


def _classify(block: _Block, callouts: list[tuple[float, float, float, float]]) -> _Block:
    text = block.text.strip()
    first = clean_heading(text.split("\n", maxsplit=1)[0])
    kind: BlockKind = BLOCK_KIND_RULE
    if _EXAMPLE_RE.match(text) or first.casefold() in {"przykład", "przykład."}:
        kind = "example"
    elif _NOTE_RE.match(text):
        kind = "note"
    elif any(_inside(block, rect) for rect in callouts) and (
        _NOTE_RE.search(text) or _EXAMPLE_RE.search(text)
    ):
        kind = "note" if _NOTE_RE.search(text) else "example"
    if kind == block.kind:
        return block
    return _Block(block.x0, block.y0, block.x1, block.y1, block.text, kind)


def split_bands(blocks: list[_Block], page_height: float) -> list[list[_Block]]:
    """Split a page into horizontal reading bands at large vertical gaps."""
    if not blocks:
        return []
    ordered = sorted(blocks, key=lambda block: (block.y0, block.x0))
    gap = max(36.0, page_height * 0.07)
    bands: list[list[_Block]] = [[ordered[0]]]
    for block in ordered[1:]:
        band_bottom = max(item.y1 for item in bands[-1])
        if block.y0 - band_bottom > gap:
            bands.append([block])
        else:
            bands[-1].append(block)
    return bands


def cluster_columns(blocks: list[_Block], page_width: float) -> list[list[_Block]]:
    """Recursively split a band into left-to-right columns on the largest x-gap."""
    if not blocks:
        return []

    def split(group: list[_Block]) -> list[list[_Block]]:
        if len(group) < 2:
            return [group]
        centers = sorted(block.cx for block in group)
        span = centers[-1] - centers[0]
        if span < page_width * 0.20:
            return [group]
        best_i = 0
        best_gap = 0.0
        for index in range(len(centers) - 1):
            gap = centers[index + 1] - centers[index]
            if gap > best_gap:
                best_gap = gap
                best_i = index
        if best_gap < page_width * 0.07:
            return [group]
        cut = (centers[best_i] + centers[best_i + 1]) / 2
        left = [block for block in group if block.cx <= cut]
        right = [block for block in group if block.cx > cut]
        if not left or not right:
            return [group]
        return split(left) + split(right)

    columns = split(blocks)
    columns.sort(key=lambda column: min(block.cx for block in column))
    return columns


def order_page_blocks(blocks: list[_Block], page_width: float, page_height: float) -> list[_Block]:
    ordered: list[_Block] = []
    for band in split_bands(blocks, page_height):
        for column in cluster_columns(band, page_width):
            ordered.extend(sorted(column, key=lambda block: (block.y0, block.x0)))
    return ordered


def _looks_like_heading(text: str) -> bool:
    first = text.split("\n", maxsplit=1)[0].strip().replace("\x08", "")
    if len(first) > 70:
        return False
    if first.endswith((",", ";", ":", "—", "-")) and len(first) > 40:
        return False
    cleaned = clean_heading(first)
    if len(cleaned) < 3 or len(cleaned) > 70:
        return False
    # Bare "Przykład" is a callout label, not a section title.
    if _EXAMPLE_RE.match(cleaned) and len(cleaned) < 24:
        return False
    if not _HEADING_LIKE_RE.match(cleaned):
        words = cleaned.split()
        if len(words) > 6:
            return False
        if len(words) >= 3 and sum(1 for word in words[1:] if word[:1].islower()) >= 2:
            return False
        letters = sum(1 for char in cleaned if char.isalpha())
        uppers = sum(1 for char in cleaned if char.isupper())
        if not (letters and uppers / letters >= 0.6 and len(words) <= 6):
            return False
    return True


def blocks_to_sections(page_number: int, blocks: list[_Block]) -> list[LayoutSection]:
    """Group ordered blocks into headed sections; examples keep the parent rule title."""
    sections: list[LayoutSection] = []
    heading = ""
    kind: BlockKind = BLOCK_KIND_RULE
    lines: list[str] = []
    parent_heading = ""

    def flush() -> None:
        nonlocal lines, heading, kind
        text = "\n".join(lines).strip()
        if not text and not heading:
            return
        if not text:
            text = heading
        sections.append(
            LayoutSection(
                page=page_number,
                heading=heading,
                text=text,
                block_kind=kind,
            )
        )
        lines = []

    for block in blocks:
        first_line = block.text.split("\n", maxsplit=1)[0].strip().replace("\x08", "")
        cleaned_first = clean_heading(first_line)
        starts_example = bool(_EXAMPLE_RE.match(cleaned_first))
        is_heading = (
            block.kind == BLOCK_KIND_RULE and not starts_example and _looks_like_heading(block.text)
        )

        if is_heading:
            flush()
            heading = cleaned_first
            parent_heading = heading
            kind = BLOCK_KIND_RULE
            rest = block.text.split("\n", maxsplit=1)
            if len(rest) > 1 and rest[1].strip():
                lines.append(rest[1].strip())
            continue

        if block.kind in {"example", "note"} or starts_example:
            # Bare "Przykład" labels next to illustrations have no body — skip as a section.
            if starts_example and len(cleaned_first) < 24 and "\n" not in block.text:
                continue
            flush()
            kind = block.kind if block.kind in {"example", "note"} else "example"
            heading = parent_heading or cleaned_first
            if starts_example and len(cleaned_first) < 24 and "\n" in block.text:
                lines.append(block.text.split("\n", maxsplit=1)[1].strip())
            else:
                lines.append(block.text)
            flush()
            kind = BLOCK_KIND_RULE
            heading = parent_heading
            continue

        lines.append(block.text)

    flush()
    return sections


def extract_layout_sections(
    pdf_path: Path,
    *,
    deadline: float | None = None,
    on_page: Callable[[int, int], None] | None = None,
) -> list[LayoutSection]:
    try:
        import pymupdf
    except ImportError as error:
        from rag_engine.ingest.pdf import IngestExtraMissingError

        raise IngestExtraMissingError(
            "PDF ingestion requires the ingest extra. Run: uv sync --extra ingest"
        ) from error

    sections: list[LayoutSection] = []
    with pymupdf.open(pdf_path) as document:  # type: ignore[no-untyped-call,unused-ignore]
        for index in range(document.page_count):
            if deadline is not None and time.monotonic() > deadline:
                raise LayoutTimeoutError(
                    f"Layout extract exceeded budget after {index} of {document.page_count} pages."
                )
            page = document.load_page(index)
            width = float(page.rect.width)
            height = float(page.rect.height)
            callouts = _callout_rects(page)
            classified = [_classify(block, callouts) for block in _page_blocks(page)]
            ordered = order_page_blocks(classified, width, height)
            sections.extend(blocks_to_sections(index + 1, ordered))
            if on_page is not None:
                on_page(index + 1, document.page_count)
    return sections


def layout_sections_to_chunks(
    sections: list[LayoutSection],
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    document_title: str,
) -> list[ChunkRecord]:
    chunks: list[ChunkRecord] = []
    page_counters: dict[int, int] = {}
    for section in sections:
        page = section.page
        for piece in split_section_text(section.text):
            index = page_counters.get(page, 0)
            page_counters[page] = index + 1
            chunks.append(
                ChunkRecord(
                    id=chunk_id_for_page(game_id, kind, doc_key, page, index),
                    game_id=game_id,
                    document_kind=kind,
                    doc_key=doc_key,
                    document_title=document_title,
                    page=page,
                    text=piece,
                    heading=section.heading,
                    image_url=page_image_url(game_id, kind, doc_key, page),
                    block_kind=section.block_kind,
                )
            )
    enriched = enrich_chunks(chunks)
    return enriched + build_catalogue_chunks(enriched)


def extract_pdf_chunks(
    pdf_path: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    document_title: str,
    time_budget_seconds: float = LAYOUT_TIME_BUDGET_SECONDS,
    on_page: Callable[[int, int], None] | None = None,
) -> tuple[list[ChunkRecord], str]:
    """Return chunks and the reader used: ``layout`` or ``pymupdf4llm``."""
    from rag_engine.ingest.chunking import chunk_markdown
    from rag_engine.ingest.pdf import assert_pdf_limits, extract_markdown

    assert_pdf_limits(pdf_path)
    deadline = time.monotonic() + time_budget_seconds
    try:
        sections = extract_layout_sections(pdf_path, deadline=deadline, on_page=on_page)
        chunks = layout_sections_to_chunks(
            sections,
            game_id=game_id,
            kind=kind,
            doc_key=doc_key,
            document_title=document_title,
        )
        if chunks:
            return chunks, "layout"
        logger.warning(
            "Layout reader returned no chunks for %s; falling back to pymupdf4llm.",
            pdf_path.name,
        )
    except LayoutTimeoutError:
        logger.warning(
            "Layout reader timed out for %s after %.0fs; falling back to pymupdf4llm.",
            pdf_path.name,
            time_budget_seconds,
        )
    except Exception:
        logger.exception(
            "Layout reader failed for %s; falling back to pymupdf4llm.",
            pdf_path.name,
        )

    extracted = extract_markdown(pdf_path)
    if on_page is not None:
        on_page(1, 1)
    chunks = chunk_markdown(
        extracted.markdown,
        game_id=game_id,
        kind=kind,
        doc_key=doc_key,
        document_title=document_title,
    )
    return chunks, "pymupdf4llm"
