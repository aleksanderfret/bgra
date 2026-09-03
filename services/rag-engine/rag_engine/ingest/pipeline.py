"""Orchestrate atomic PDF / transcript / FAQ ingestion."""

from __future__ import annotations

import json
import shutil
import uuid
from collections.abc import Callable
from pathlib import Path

from rag_engine.contract import DocumentKind, GameSummary
from rag_engine.ingest.bgg_faq import BggUnavailableError, build_faq_chunks
from rag_engine.ingest.chunking import chunk_markdown
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pdf import extract_markdown, render_page_pngs
from rag_engine.ingest.registry import recount_game
from rag_engine.storage_paths import (
    CHUNKS_FILE_NAME,
    SOURCE_PDF_NAME,
    assert_game_id,
    document_dir,
    game_assets_dir,
)

ProgressCallback = Callable[[str], None]


def _log(message: str, progress: ProgressCallback | None) -> None:
    if progress is not None:
        progress(message)
    else:
        print(message, flush=True)


def write_chunks_jsonl(path: Path, chunks: list[ChunkRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [chunk.model_dump_json() for chunk in chunks]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def read_chunks_jsonl(path: Path) -> list[ChunkRecord]:
    if not path.is_file():
        return []
    chunks: list[ChunkRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            chunks.append(ChunkRecord.model_validate_json(line))
    return chunks


def count_chunks_for_game(storage_dir: Path, game_id: str) -> int:
    root = game_assets_dir(storage_dir, game_id) / "documents"
    if not root.is_dir():
        return 0
    total = 0
    for chunks_file in root.rglob(CHUNKS_FILE_NAME):
        total += len(read_chunks_jsonl(chunks_file))
    return total


def list_document_kinds(storage_dir: Path, game_id: str) -> list[DocumentKind]:
    root = game_assets_dir(storage_dir, game_id) / "documents"
    if not root.is_dir():
        return []
    allowed: set[str] = {
        "rulebook",
        "faq",
        "errata",
        "player_aid",
        "video_transcript",
    }
    kinds: set[DocumentKind] = set()
    for kind_dir in root.iterdir():
        if kind_dir.is_dir() and kind_dir.name in allowed and any(kind_dir.rglob(CHUNKS_FILE_NAME)):
            kinds.add(kind_dir.name)  # type: ignore[arg-type]
    return sorted(kinds)


def _promote_document(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    tmp_doc: Path,
    tmp_pages: Path | None,
) -> None:
    final_doc = document_dir(storage_dir, game_id, kind, doc_key)
    final_doc.parent.mkdir(parents=True, exist_ok=True)
    if final_doc.exists():
        shutil.rmtree(final_doc)
    shutil.move(str(tmp_doc), str(final_doc))

    if tmp_pages is not None and tmp_pages.is_dir():
        assets = game_assets_dir(storage_dir, game_id)
        assets.mkdir(parents=True, exist_ok=True)
        for png in sorted(tmp_pages.glob("p*.png")):
            target = assets / png.name
            if target.exists():
                target.unlink()
            shutil.move(str(png), str(target))


def ingest_pdf(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    pdf_path: Path,
    title: str | None = None,
    doc_key: str = "main",
    progress: ProgressCallback | None = None,
) -> list[ChunkRecord]:
    assert_game_id(game_id)
    pdf_path = pdf_path.resolve()
    work = game_assets_dir(storage_dir, game_id) / f".ingest-tmp-{uuid.uuid4().hex}"
    tmp_doc = work / "documents" / kind / doc_key
    tmp_pages = work / "pages"
    try:
        work.mkdir(parents=True, exist_ok=False)
        tmp_doc.mkdir(parents=True, exist_ok=True)

        _log(f"extracting markdown from {pdf_path.name}", progress)
        extracted = extract_markdown(pdf_path)
        _log(f"rendering {extracted.page_count} page image(s)", progress)
        render_page_pngs(pdf_path, tmp_pages)

        chunks = chunk_markdown(extracted.markdown, game_id=game_id, kind=kind)
        if not chunks:
            raise RuntimeError("No text chunks were extracted from the PDF.")

        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, chunks)
        shutil.copy2(pdf_path, tmp_doc / SOURCE_PDF_NAME)

        _log("promoting files into storage", progress)
        _promote_document(storage_dir, game_id, kind, doc_key, tmp_doc, tmp_pages)
        recount_game(storage_dir, game_id, title=title)
        _log(f"ingested {len(chunks)} chunk(s) for {game_id}", progress)
        return chunks
    finally:
        if work.exists():
            shutil.rmtree(work, ignore_errors=True)


def ingest_rulebook(
    storage_dir: Path,
    *,
    game_id: str,
    pdf_path: Path,
    title: str | None = None,
    fetch_community_faq: bool = False,
    progress: ProgressCallback | None = None,
) -> GameSummary:
    ingest_pdf(
        storage_dir,
        game_id=game_id,
        kind="rulebook",
        pdf_path=pdf_path,
        title=title,
        progress=progress,
    )
    if fetch_community_faq:
        resolved_title = title or game_id
        try:
            doc_key, faq_chunks = build_faq_chunks(
                game_id=game_id,
                title_query=resolved_title,
            )
            ingest_chunks(
                storage_dir,
                game_id=game_id,
                kind="faq",
                doc_key=doc_key,
                chunks=faq_chunks,
                title=resolved_title,
                progress=progress,
            )
        except BggUnavailableError as error:
            _log(f"community FAQ skipped: {error}", progress)
    return recount_game(storage_dir, game_id, title=title)


def ingest_chunks(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    chunks: list[ChunkRecord],
    title: str | None = None,
    progress: ProgressCallback | None = None,
) -> list[ChunkRecord]:
    """Write pre-built chunks (FAQ / transcript) atomically."""
    assert_game_id(game_id)
    work = game_assets_dir(storage_dir, game_id) / f".ingest-tmp-{uuid.uuid4().hex}"
    tmp_doc = work / "documents" / kind / doc_key
    try:
        work.mkdir(parents=True, exist_ok=False)
        tmp_doc.mkdir(parents=True, exist_ok=True)
        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, chunks)
        _promote_document(storage_dir, game_id, kind, doc_key, tmp_doc, None)
        recount_game(storage_dir, game_id, title=title)
        _log(f"ingested {len(chunks)} {kind} chunk(s) for {game_id}", progress)
        return chunks
    finally:
        if work.exists():
            shutil.rmtree(work, ignore_errors=True)


def dump_manifest(chunks: list[ChunkRecord]) -> str:
    return json.dumps([chunk.model_dump() for chunk in chunks], ensure_ascii=False)
