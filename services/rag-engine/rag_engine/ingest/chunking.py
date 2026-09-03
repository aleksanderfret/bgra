"""Split Markdown into chunks that never cross a section boundary."""

from __future__ import annotations

import re
from dataclasses import dataclass

from rag_engine.contract import DocumentKind
from rag_engine.ingest.models import ChunkRecord, chunk_id_for_page
from rag_engine.storage_paths import page_image_url

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_PAGE_MARKER_RE = re.compile(r"^-----?\s*(\d+)\s*-----?$")


@dataclass(frozen=True)
class _Section:
    heading: str
    page: int | None
    lines: list[str]


def _parse_sections(markdown: str) -> list[_Section]:
    sections: list[_Section] = []
    current_heading = ""
    current_page: int | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        text = "\n".join(current_lines).strip()
        if text or current_heading:
            sections.append(
                _Section(heading=current_heading, page=current_page, lines=current_lines.copy())
            )
        current_lines = []

    for raw_line in markdown.splitlines():
        page_match = _PAGE_MARKER_RE.match(raw_line.strip())
        if page_match:
            # Page markers apply to following content; close the open section first.
            if current_lines or current_heading:
                flush()
                current_heading = ""
            current_page = int(page_match.group(1))
            continue

        heading_match = _HEADING_RE.match(raw_line)
        if heading_match:
            flush()
            current_heading = heading_match.group(2).strip()
            continue

        current_lines.append(raw_line)

    flush()
    return sections


def chunk_markdown(
    markdown: str,
    *,
    game_id: str,
    kind: DocumentKind,
) -> list[ChunkRecord]:
    """One chunk per heading section; page comes from the nearest page marker."""
    chunks: list[ChunkRecord] = []
    page_counters: dict[int | None, int] = {}

    for section in _parse_sections(markdown):
        text = "\n".join(section.lines).strip()
        if not text and not section.heading:
            continue
        if not text:
            text = section.heading

        page = section.page
        index = page_counters.get(page, 0)
        page_counters[page] = index + 1

        if page is None:
            # Unpaged markdown (rare for pymupdf4llm); still emit a stable id.
            chunk_id = f"{game_id}:{kind}:p00:c{index:02d}"
            image_url = None
        else:
            chunk_id = chunk_id_for_page(game_id, kind, page, index)
            image_url = page_image_url(game_id, page)

        chunks.append(
            ChunkRecord(
                id=chunk_id,
                game_id=game_id,
                document_kind=kind,
                page=page,
                text=text,
                heading=section.heading,
                image_url=image_url,
            )
        )

    return chunks
