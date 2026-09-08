"""Split Markdown into chunks that never cross a section boundary."""

from __future__ import annotations

import re
from dataclasses import dataclass

from rag_engine.contract import DocumentKind
from rag_engine.ingest.models import ChunkRecord, chunk_id_for_page
from rag_engine.storage_paths import page_image_url

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_PAGE_MARKER_RE = re.compile(r"^-----?\s*(\d+)\s*-----?$")
_PARAGRAPH_RE = re.compile(r"\n\s*\n")
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")

#: A whole rulebook section can run for pages. The answer model reads every
#: retrieved passage before it writes a word, and the cross-encoder scores what
#: it is given, so oversized passages cost both latency and ranking accuracy.
CHUNK_TARGET_CHARS = 900
#: Trailing text repeated at the start of the next piece, so a rule that
#: straddles a cut stays readable in one of them.
CHUNK_OVERLAP_CHARS = 180

_PARAGRAPH_SEPARATOR = "\n\n"


def _wrap_words(text: str, limit: int) -> list[str]:
    pieces: list[str] = []
    current: list[str] = []
    length = 0
    for word in text.split():
        extra = len(word) + (1 if current else 0)
        if current and length + extra > limit:
            pieces.append(" ".join(current))
            current = []
            length = 0
            extra = len(word)
        current.append(word)
        length += extra
    if current:
        pieces.append(" ".join(current))
    return pieces


def _split_paragraph(paragraph: str, limit: int) -> list[str]:
    if len(paragraph) <= limit:
        return [paragraph]
    units: list[str] = []
    current = ""
    for sentence in _SENTENCE_END_RE.split(paragraph):
        parts = _wrap_words(sentence, limit) if len(sentence) > limit else [sentence]
        for part in parts:
            candidate = f"{current} {part}" if current else part
            if current and len(candidate) > limit:
                units.append(current)
                current = part
            else:
                current = candidate
    if current:
        units.append(current)
    return units


def split_section_text(
    text: str,
    *,
    target: int = CHUNK_TARGET_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """Cut one section into pieces of at most `target` characters."""
    stripped = text.strip()
    if len(stripped) <= target:
        return [stripped]

    units = [
        unit
        for paragraph in _PARAGRAPH_RE.split(stripped)
        if paragraph.strip()
        for unit in _split_paragraph(paragraph.strip(), target)
    ]

    pieces: list[str] = []
    current: list[str] = []
    # How many leading units of `current` are repeated from the previous piece,
    # so a piece is never emitted with nothing but that repetition in it.
    carried = 0
    length = 0
    for unit in units:
        extra = len(unit) + (len(_PARAGRAPH_SEPARATOR) if current else 0)
        if current and length + extra > target:
            if len(current) > carried:
                pieces.append(_PARAGRAPH_SEPARATOR.join(current))
                tail = current[-1]
                if len(current) > 1 and len(tail) <= overlap:
                    current, carried, length = [tail], 1, len(tail)
                else:
                    current, carried, length = [], 0, 0
            else:
                current, carried, length = [], 0, 0
            extra = len(unit) + (len(_PARAGRAPH_SEPARATOR) if current else 0)
        current.append(unit)
        length += extra
    if len(current) > carried:
        pieces.append(_PARAGRAPH_SEPARATOR.join(current))
    return pieces


@dataclass(frozen=True)
class _Section:
    heading: str
    page: int | None
    lines: list[str]


_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_STRIKE_RE = re.compile(r"~~+")
_EMPHASIS_RE = re.compile(r"[*_`]{1,3}")
_SPACE_RE = re.compile(r"\s+")


def clean_heading(heading: str) -> str:
    """Strip Markdown/HTML noise left by the PDF reader from a section title.

    Publisher PDFs often survive as `**Akcje**` or
    `<mark>Budow</mark> a** **Bazy` — those marks are not part of the name.
    """
    text = _HTML_TAG_RE.sub("", heading)
    text = _STRIKE_RE.sub("", text)
    text = _EMPHASIS_RE.sub("", text)
    text = text.replace("\x08", "")
    return _SPACE_RE.sub(" ", text).strip(" -_|")


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
            current_heading = clean_heading(heading_match.group(2))
            continue

        current_lines.append(raw_line)

    flush()
    return sections


def chunk_markdown(
    markdown: str,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    document_title: str,
) -> list[ChunkRecord]:
    """Chunks never cross a heading; long sections are cut to `CHUNK_TARGET_CHARS`."""
    chunks: list[ChunkRecord] = []
    page_counters: dict[int | None, int] = {}

    for section in _parse_sections(markdown):
        text = "\n".join(section.lines).strip()
        if not text and not section.heading:
            continue
        if not text:
            text = section.heading

        page = section.page
        for piece in split_section_text(text):
            index = page_counters.get(page, 0)
            page_counters[page] = index + 1

            if page is None:
                chunk_id = f"{game_id}:{kind}:{doc_key}:p00:c{index:02d}"
                image_url = None
            else:
                chunk_id = chunk_id_for_page(game_id, kind, doc_key, page, index)
                image_url = page_image_url(game_id, kind, doc_key, page)

            chunks.append(
                ChunkRecord(
                    id=chunk_id,
                    game_id=game_id,
                    document_kind=kind,
                    doc_key=doc_key,
                    document_title=document_title,
                    page=page,
                    text=piece,
                    heading=section.heading,
                    image_url=image_url,
                )
            )

    from rag_engine.ingest.section_map import build_catalogue_chunks, enrich_chunks

    enriched = enrich_chunks(chunks)
    return enriched + build_catalogue_chunks(enriched)
