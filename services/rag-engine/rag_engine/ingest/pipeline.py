"""Orchestrate atomic PDF / transcript / FAQ ingestion."""

from __future__ import annotations

import json
import shutil
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from rag_engine.contract import DocumentKind, GameDocumentSummary, GameSummary
from rag_engine.ingest.bgg_faq import BggUnavailableError, build_faq_chunks
from rag_engine.ingest.chunking import chunk_markdown
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pdf import extract_markdown, render_page_pngs
from rag_engine.ingest.registry import recount_game
from rag_engine.storage_paths import (
    CHUNKS_FILE_NAME,
    MANIFEST_FILE_NAME,
    SOURCE_PDF_NAME,
    assert_doc_key,
    assert_game_id,
    document_dir,
    game_assets_dir,
    slugify_doc_key,
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


def write_document_manifest(
    path: Path,
    *,
    title: str,
    kind: DocumentKind,
    indexed_at: str | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    stamped = indexed_at or datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "title": title,
        "documentKind": kind,
        "indexedAt": stamped,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_document_manifest(path: Path) -> dict[str, str] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    title = payload.get("title")
    kind = payload.get("documentKind")
    indexed_at = payload.get("indexedAt")
    if not isinstance(title, str) or not isinstance(kind, str) or not isinstance(indexed_at, str):
        return None
    return {"title": title, "documentKind": kind, "indexedAt": indexed_at}


def list_game_documents(storage_dir: Path, game_id: str) -> list[GameDocumentSummary]:
    root = game_assets_dir(storage_dir, game_id) / "documents"
    if not root.is_dir():
        return []
    allowed: set[DocumentKind] = {
        "rulebook",
        "faq",
        "errata",
        "player_aid",
        "video_transcript",
    }
    documents: list[GameDocumentSummary] = []
    for kind_dir in sorted(root.iterdir()):
        if not kind_dir.is_dir():
            continue
        kind_name = kind_dir.name
        if kind_name not in allowed:
            continue
        for doc_dir in sorted(kind_dir.iterdir()):
            if not doc_dir.is_dir():
                continue
            chunks_file = doc_dir / CHUNKS_FILE_NAME
            if not chunks_file.is_file():
                continue
            chunk_count = len(read_chunks_jsonl(chunks_file))
            manifest = read_document_manifest(doc_dir / MANIFEST_FILE_NAME)
            title = manifest["title"] if manifest else doc_dir.name
            indexed_at = (
                manifest["indexedAt"]
                if manifest
                else datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            )
            documents.append(
                GameDocumentSummary(
                    doc_key=doc_dir.name,
                    document_kind=kind_name,
                    title=title,
                    chunk_count=chunk_count,
                    indexed_at=indexed_at,
                )
            )
    return documents


def count_chunks_for_game(storage_dir: Path, game_id: str) -> int:
    return sum(doc.chunk_count for doc in list_game_documents(storage_dir, game_id))


def list_document_kinds(storage_dir: Path, game_id: str) -> list[DocumentKind]:
    return sorted({doc.document_kind for doc in list_game_documents(storage_dir, game_id)})


def _promote_document(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    tmp_doc: Path,
) -> None:
    final_doc = document_dir(storage_dir, game_id, kind, doc_key)
    final_doc.parent.mkdir(parents=True, exist_ok=True)
    if final_doc.exists():
        shutil.rmtree(final_doc)
    shutil.move(str(tmp_doc), str(final_doc))


def migrate_legacy_flat_pages(storage_dir: Path, game_id: str) -> bool:
    """Move flat `assets/<gameId>/pNN.png` into `documents/rulebook/main/` if needed."""
    assert_game_id(game_id)
    assets = game_assets_dir(storage_dir, game_id)
    if not assets.is_dir():
        return False
    flat_pages = sorted(assets.glob("p*.png"))
    if not flat_pages:
        return False
    main_doc = document_dir(storage_dir, game_id, "rulebook", "main")
    main_doc.mkdir(parents=True, exist_ok=True)
    for png in flat_pages:
        target = main_doc / png.name
        if target.exists():
            target.unlink()
        shutil.move(str(png), str(target))

    legacy_chunks = assets / CHUNKS_FILE_NAME
    chunks_file = main_doc / CHUNKS_FILE_NAME
    if legacy_chunks.is_file() and not chunks_file.is_file():
        shutil.move(str(legacy_chunks), str(chunks_file))

    if chunks_file.is_file():
        chunks = read_chunks_jsonl(chunks_file)
        rewritten: list[ChunkRecord] = []
        for chunk in chunks:
            image_url = chunk.image_url
            if image_url and "/documents/" not in image_url and chunk.page is not None:
                image_url = (
                    f"/static/assets/{game_id}/documents/rulebook/main/p{chunk.page:02d}.png"
                )
            new_id = chunk.id
            if ":main:" not in chunk.id:
                new_id = chunk.id.replace(
                    f"{game_id}:{chunk.document_kind}:",
                    f"{game_id}:{chunk.document_kind}:main:",
                    1,
                )
            rewritten.append(
                chunk.model_copy(
                    update={
                        "doc_key": "main",
                        "document_title": chunk.document_title or "Rulebook",
                        "image_url": image_url,
                        "id": new_id,
                    }
                )
            )
        write_chunks_jsonl(chunks_file, rewritten)
    if not (main_doc / MANIFEST_FILE_NAME).is_file():
        write_document_manifest(
            main_doc / MANIFEST_FILE_NAME,
            title="Rulebook",
            kind="rulebook",
        )
    return True


def ingest_pdf(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    pdf_path: Path,
    title: str | None = None,
    document_title: str | None = None,
    doc_key: str | None = None,
    base_game_id: str | None = None,
    progress: ProgressCallback | None = None,
) -> list[ChunkRecord]:
    assert_game_id(game_id)
    if base_game_id is not None:
        assert_game_id(base_game_id)
    pdf_path = pdf_path.resolve()
    resolved_doc_title = (document_title or "Rulebook").strip() or "Rulebook"
    if doc_key:
        resolved_doc_key = assert_doc_key(doc_key)
    elif resolved_doc_title.lower() in {"rulebook", "instrukcja"}:
        resolved_doc_key = "main"
    else:
        resolved_doc_key = assert_doc_key(slugify_doc_key(resolved_doc_title))
    work = game_assets_dir(storage_dir, game_id) / f".ingest-tmp-{uuid.uuid4().hex}"
    tmp_doc = work / "documents" / kind / resolved_doc_key
    try:
        work.mkdir(parents=True, exist_ok=False)
        tmp_doc.mkdir(parents=True, exist_ok=True)

        _log(f"extracting markdown from {pdf_path.name}", progress)
        extracted = extract_markdown(pdf_path)
        _log(f"rendering {extracted.page_count} page image(s)", progress)
        render_page_pngs(pdf_path, tmp_doc)

        chunks = chunk_markdown(
            extracted.markdown,
            game_id=game_id,
            kind=kind,
            doc_key=resolved_doc_key,
            document_title=resolved_doc_title,
        )
        if not chunks:
            raise RuntimeError("No text chunks were extracted from the PDF.")

        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, chunks)
        shutil.copy2(pdf_path, tmp_doc / SOURCE_PDF_NAME)
        write_document_manifest(
            tmp_doc / MANIFEST_FILE_NAME,
            title=resolved_doc_title,
            kind=kind,
        )

        _log("promoting files into storage", progress)
        _promote_document(storage_dir, game_id, kind, resolved_doc_key, tmp_doc)
        recount_game(
            storage_dir,
            game_id,
            title=title,
            base_game_id=base_game_id,
        )
        _log(f"ingested {len(chunks)} chunk(s) for {game_id}/{resolved_doc_key}", progress)
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
    document_title: str | None = None,
    doc_key: str | None = None,
    base_game_id: str | None = None,
    fetch_community_faq: bool = False,
    progress: ProgressCallback | None = None,
) -> GameSummary:
    ingest_pdf(
        storage_dir,
        game_id=game_id,
        kind="rulebook",
        pdf_path=pdf_path,
        title=title,
        document_title=document_title,
        doc_key=doc_key,
        base_game_id=base_game_id,
        progress=progress,
    )
    if fetch_community_faq:
        resolved_title = title or game_id
        try:
            faq_doc_key, faq_chunks = build_faq_chunks(
                game_id=game_id,
                title_query=resolved_title,
            )
            ingest_chunks(
                storage_dir,
                game_id=game_id,
                kind="faq",
                doc_key=faq_doc_key,
                chunks=faq_chunks,
                title=resolved_title,
                document_title="BoardGameGeek description",
                base_game_id=base_game_id,
                progress=progress,
            )
        except BggUnavailableError as error:
            _log(f"community FAQ skipped: {error}", progress)
    return recount_game(
        storage_dir,
        game_id,
        title=title,
        base_game_id=base_game_id,
    )


def ingest_chunks(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    chunks: list[ChunkRecord],
    title: str | None = None,
    document_title: str | None = None,
    base_game_id: str | None = None,
    progress: ProgressCallback | None = None,
) -> list[ChunkRecord]:
    """Write pre-built chunks (FAQ / transcript) atomically."""
    assert_game_id(game_id)
    assert_doc_key(doc_key)
    if base_game_id is not None:
        assert_game_id(base_game_id)
    resolved_doc_title = (document_title or title or doc_key).strip() or doc_key
    stamped_chunks = [
        chunk.model_copy(
            update={
                "doc_key": doc_key,
                "document_title": chunk.document_title or resolved_doc_title,
            }
        )
        for chunk in chunks
    ]
    work = game_assets_dir(storage_dir, game_id) / f".ingest-tmp-{uuid.uuid4().hex}"
    tmp_doc = work / "documents" / kind / doc_key
    try:
        work.mkdir(parents=True, exist_ok=False)
        tmp_doc.mkdir(parents=True, exist_ok=True)
        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, stamped_chunks)
        write_document_manifest(
            tmp_doc / MANIFEST_FILE_NAME,
            title=resolved_doc_title,
            kind=kind,
        )
        _promote_document(storage_dir, game_id, kind, doc_key, tmp_doc)
        recount_game(
            storage_dir,
            game_id,
            title=title,
            base_game_id=base_game_id,
        )
        _log(f"ingested {len(stamped_chunks)} {kind} chunk(s) for {game_id}", progress)
        return stamped_chunks
    finally:
        if work.exists():
            shutil.rmtree(work, ignore_errors=True)


def dump_manifest(chunks: list[ChunkRecord]) -> str:
    return json.dumps([chunk.model_dump() for chunk in chunks], ensure_ascii=False)
