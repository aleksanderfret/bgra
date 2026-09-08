"""Section map and catalogue chunks built at import / migration time.

A catalogue chunk lists every named section once. It is searchable like any other
passage so "list every action" can hit a single complete list. The ask path keeps
it for the model and drops it from the player-facing sources list — it is an
index aid, not a page the player can open.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from rag_engine.ingest.chunking import CHUNK_TARGET_CHARS, clean_heading, split_section_text
from rag_engine.ingest.models import BLOCK_KIND_CATALOGUE, BLOCK_KIND_RULE, ChunkRecord

SECTION_MAP_VERSION = 1

# Re-export kinds so tests and callers import from one place.
__all__ = [
    "BLOCK_KIND_CATALOGUE",
    "BLOCK_KIND_RULE",
    "SECTION_MAP_VERSION",
    "build_catalogue_chunks",
    "enrich_chunks",
    "section_id_for",
]

_SLUG_RE = re.compile(r"[^\w]+", re.UNICODE)


def section_id_for(heading: str) -> str:
    cleaned = clean_heading(heading).casefold()
    slug = _SLUG_RE.sub("-", cleaned).strip("-")
    return slug or "untitled"


def enrich_chunks(chunks: Sequence[ChunkRecord]) -> list[ChunkRecord]:
    """Attach section_id; keep example/note kinds from the layout reader."""
    enriched: list[ChunkRecord] = []
    for chunk in chunks:
        if chunk.block_kind == BLOCK_KIND_CATALOGUE:
            enriched.append(chunk)
            continue
        heading = clean_heading(chunk.heading)
        kind = chunk.block_kind if chunk.block_kind != BLOCK_KIND_RULE else BLOCK_KIND_RULE
        if chunk.block_kind in {"example", "note"}:
            kind = chunk.block_kind
        enriched.append(
            chunk.model_copy(
                update={
                    "heading": heading,
                    "section_id": section_id_for(heading) if heading else "",
                    "block_kind": kind,
                }
            )
        )
    return enriched


def build_catalogue_chunks(chunks: Sequence[ChunkRecord]) -> list[ChunkRecord]:
    """One (or more, if long) catalogue chunk listing every named section once."""
    if not chunks:
        return []
    sample = next(chunk for chunk in chunks)
    lines: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        if chunk.block_kind == BLOCK_KIND_CATALOGUE:
            continue
        heading = clean_heading(chunk.heading)
        if not heading:
            continue
        section_id = section_id_for(heading)
        if section_id in seen:
            continue
        seen.add(section_id)
        page = "" if chunk.page is None else str(chunk.page)
        lines.append(f"page {page}: {heading}" if page else heading)
    if not lines:
        return []

    intro = (
        "Section catalogue / lista sekcji / spis treści for this document. "
        "Each line is one named section in reading order (page, then title):"
    )
    pieces = split_section_text("\n".join(lines), target=CHUNK_TARGET_CHARS)
    out: list[ChunkRecord] = []
    for index, piece in enumerate(pieces):
        text = f"{intro}\n{piece}" if index == 0 else piece
        out.append(
            ChunkRecord(
                id=f"{sample.game_id}:{sample.document_kind}:{sample.doc_key}:catalogue:c{index:02d}",
                game_id=sample.game_id,
                document_kind=sample.document_kind,
                doc_key=sample.doc_key,
                document_title=sample.document_title,
                page=None,
                text=text,
                heading="Contents",
                image_url=None,
                section_id="catalogue",
                block_kind=BLOCK_KIND_CATALOGUE,
            )
        )
    return out
