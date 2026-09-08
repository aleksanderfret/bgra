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
from rag_engine.ingest.chunking import clean_heading, split_section_text
from rag_engine.ingest.layout import (
    INGEST_LAYOUT_VERSION,
    extract_pdf_chunks,
)
from rag_engine.ingest.models import BLOCK_KIND_CATALOGUE, ChunkRecord
from rag_engine.ingest.pdf import render_page_pngs
from rag_engine.ingest.registry import load_games, recount_game
from rag_engine.ingest.section_map import (
    SECTION_MAP_VERSION,
    build_catalogue_chunks,
    enrich_chunks,
)
from rag_engine.retrieval.indexer import maybe_index_document
from rag_engine.settings import get_settings
from rag_engine.storage_paths import (
    CHUNKS_FILE_NAME,
    MANIFEST_FILE_NAME,
    SOURCE_PDF_NAME,
    assert_doc_key,
    assert_game_id,
    chunks_path,
    document_dir,
    game_assets_dir,
    slugify_doc_key,
    source_pdf_path,
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


def _upgrade_legacy_chunk(chunk: ChunkRecord, *, doc_key: str) -> ChunkRecord:
    image_url = chunk.image_url
    if image_url and "/documents/" not in image_url and chunk.page is not None:
        image_url = (
            f"/static/assets/{chunk.game_id}/documents/{chunk.document_kind}/"
            f"{doc_key}/p{chunk.page:02d}.png"
        )
    new_id = chunk.id
    marker = f"{chunk.game_id}:{chunk.document_kind}:{doc_key}:"
    prefix = f"{chunk.game_id}:{chunk.document_kind}:"
    if marker not in new_id and new_id.startswith(prefix):
        new_id = new_id.replace(prefix, marker, 1)
    return chunk.model_copy(update={"doc_key": doc_key, "id": new_id, "image_url": image_url})


def read_chunks_jsonl(path: Path) -> list[ChunkRecord]:
    if not path.is_file():
        return []
    inferred_doc_key = path.parent.name
    chunks: list[ChunkRecord] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            continue
        if "doc_key" not in payload:
            payload["doc_key"] = inferred_doc_key
        chunk = ChunkRecord.model_validate(payload)
        chunks.append(_upgrade_legacy_chunk(chunk, doc_key=inferred_doc_key))
    return chunks


def write_document_manifest(
    path: Path,
    *,
    title: str,
    kind: DocumentKind,
    indexed_at: str | None = None,
    section_map_version: int | None = None,
    ingest_layout_version: int | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    stamped = indexed_at or datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload: dict[str, object] = {
        "title": title,
        "documentKind": kind,
        "indexedAt": stamped,
    }
    previous = _read_manifest_raw(path) if path.is_file() else None
    if section_map_version is not None:
        payload["sectionMapVersion"] = section_map_version
    elif previous is not None and "sectionMapVersion" in previous:
        payload["sectionMapVersion"] = previous["sectionMapVersion"]
    if ingest_layout_version is not None:
        payload["ingestLayoutVersion"] = ingest_layout_version
    elif previous is not None and "ingestLayoutVersion" in previous:
        payload["ingestLayoutVersion"] = previous["ingestLayoutVersion"]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_manifest_raw(path: Path) -> dict[str, object] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def read_document_manifest(path: Path) -> dict[str, str] | None:
    payload = _read_manifest_raw(path)
    if payload is None:
        return None
    title = payload.get("title")
    kind = payload.get("documentKind")
    indexed_at = payload.get("indexedAt")
    if not isinstance(title, str) or not isinstance(kind, str) or not isinstance(indexed_at, str):
        return None
    result = {"title": title, "documentKind": kind, "indexedAt": indexed_at}
    for key in ("sectionMapVersion", "ingestLayoutVersion"):
        version = payload.get(key)
        if isinstance(version, int):
            result[key] = str(version)
        elif isinstance(version, str) and version.isdigit():
            result[key] = version
    return result


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


def active_set_has_chunks(storage_dir: Path, game_ids: list[str]) -> bool:
    """True when any game in the active set has chunk JSONL on disk (read-only)."""
    return any(count_chunks_for_game(storage_dir, game_id) > 0 for game_id in game_ids)


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
        rewritten = [
            _upgrade_legacy_chunk(chunk, doc_key="main").model_copy(
                update={"document_title": chunk.document_title or "Rulebook"}
            )
            for chunk in chunks
        ]
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

        _log(f"reading page layout from {pdf_path.name}", progress)
        chunks, reader = extract_pdf_chunks(
            pdf_path,
            game_id=game_id,
            kind=kind,
            doc_key=resolved_doc_key,
            document_title=resolved_doc_title,
        )
        _log(f"layout reader={reader}", progress)
        _log("rendering page image(s)", progress)
        render_page_pngs(pdf_path, tmp_doc)

        if not chunks:
            raise RuntimeError("No text chunks were extracted from the PDF.")

        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, chunks)
        shutil.copy2(pdf_path, tmp_doc / SOURCE_PDF_NAME)
        write_document_manifest(
            tmp_doc / MANIFEST_FILE_NAME,
            title=resolved_doc_title,
            kind=kind,
            section_map_version=SECTION_MAP_VERSION,
            # Only stamp success. A fallback leaves 0 so the next boot retries layout.
            ingest_layout_version=INGEST_LAYOUT_VERSION if reader == "layout" else 0,
        )

        _log("promoting files into storage", progress)
        _promote_document(storage_dir, game_id, kind, resolved_doc_key, tmp_doc)
        recount_game(
            storage_dir,
            game_id,
            title=title,
            base_game_id=base_game_id,
        )
        _index_written_document(
            storage_dir,
            game_id=game_id,
            kind=kind,
            doc_key=resolved_doc_key,
            chunks=chunks,
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
    enriched = enrich_chunks(stamped_chunks)
    finalized = enriched + build_catalogue_chunks(enriched)
    work = game_assets_dir(storage_dir, game_id) / f".ingest-tmp-{uuid.uuid4().hex}"
    tmp_doc = work / "documents" / kind / doc_key
    try:
        work.mkdir(parents=True, exist_ok=False)
        tmp_doc.mkdir(parents=True, exist_ok=True)
        write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, finalized)
        write_document_manifest(
            tmp_doc / MANIFEST_FILE_NAME,
            title=resolved_doc_title,
            kind=kind,
            section_map_version=SECTION_MAP_VERSION,
        )
        _promote_document(storage_dir, game_id, kind, doc_key, tmp_doc)
        recount_game(
            storage_dir,
            game_id,
            title=title,
            base_game_id=base_game_id,
        )
        _index_written_document(
            storage_dir,
            game_id=game_id,
            kind=kind,
            doc_key=doc_key,
            chunks=finalized,
        )
        _log(f"ingested {len(finalized)} {kind} chunk(s) for {game_id}", progress)
        return finalized
    finally:
        if work.exists():
            shutil.rmtree(work, ignore_errors=True)


def dump_manifest(chunks: list[ChunkRecord]) -> str:
    return json.dumps([chunk.model_dump() for chunk in chunks], ensure_ascii=False)


def _index_written_document(
    storage_dir: Path,
    *,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    chunks: list[ChunkRecord],
) -> None:
    final_doc = document_dir(storage_dir, game_id, kind, doc_key)
    manifest = read_document_manifest(final_doc / MANIFEST_FILE_NAME)
    indexed_at = (
        manifest["indexedAt"] if manifest else datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    settings = get_settings()
    maybe_index_document(
        storage_dir,
        game_id=game_id,
        kind=kind,
        doc_key=doc_key,
        chunks=chunks,
        indexed_at=indexed_at,
        ollama_url=settings.ollama_url,
        embedding_model=settings.profile.embedding,
    )


def _resplit_chunks(chunks: list[ChunkRecord]) -> list[ChunkRecord]:
    resplit: list[ChunkRecord] = []
    for chunk in chunks:
        if chunk.block_kind == BLOCK_KIND_CATALOGUE or ":catalogue:" in chunk.id:
            resplit.append(chunk)
            continue
        heading = clean_heading(chunk.heading)
        for index, piece in enumerate(split_section_text(chunk.text)):
            # Suffixing keeps the first piece addressable under the id already
            # in the index, and works for page, FAQ and transcript id formats.
            piece_id = chunk.id if index == 0 else f"{chunk.id}:s{index:02d}"
            resplit.append(
                chunk.model_copy(update={"id": piece_id, "text": piece, "heading": heading})
            )
    return resplit


def resplit_stored_chunks(
    storage_dir: Path,
    progress: ProgressCallback | None = None,
) -> int:
    """Cut oversized stored chunks down to size and reindex them.

    Documents imported before the size cap keep their text in `chunks.jsonl`,
    so this never needs the original PDF back. Returns documents rewritten.
    """
    settings = get_settings()
    rewritten = 0
    for game in load_games(storage_dir):
        for document in list_game_documents(storage_dir, game.game_id):
            path = chunks_path(storage_dir, game.game_id, document.document_kind, document.doc_key)
            chunks = read_chunks_jsonl(path)
            resplit = _resplit_chunks(chunks)
            if resplit == chunks:
                continue
            write_chunks_jsonl(path, resplit)
            maybe_index_document(
                storage_dir,
                game_id=game.game_id,
                kind=document.document_kind,
                doc_key=document.doc_key,
                chunks=resplit,
                indexed_at=document.indexed_at,
                ollama_url=settings.ollama_url,
                embedding_model=settings.profile.embedding,
            )
            recount_game(storage_dir, game.game_id)
            rewritten += 1
            _log(
                f"re-split {game.game_id}/{document.doc_key}: "
                f"{len(chunks)} -> {len(resplit)} chunk(s)",
                progress,
            )
    return rewritten


def _strip_catalogue(chunks: list[ChunkRecord]) -> list[ChunkRecord]:
    return [
        chunk
        for chunk in chunks
        if chunk.block_kind != BLOCK_KIND_CATALOGUE and ":catalogue:" not in chunk.id
    ]


def _manifest_version(manifest: dict[str, str] | None, key: str) -> int:
    raw = manifest.get(key) if manifest else None
    return int(raw) if raw and raw.isdigit() else 0


def ensure_section_maps(
    storage_dir: Path,
    progress: ProgressCallback | None = None,
) -> int:
    """Add section ids and a catalogue chunk to documents that predate Stage 3G.

    Idempotent via ``sectionMapVersion`` on the document manifest — runs once per
    document, not on every engine start. Works from ``chunks.jsonl`` alone (no PDF).
    Documents that still need a layout re-extract are skipped: layout rebuilds the
    catalogue itself and would discard this work.
    """
    settings = get_settings()
    rewritten = 0
    for game in load_games(storage_dir):
        for document in list_game_documents(storage_dir, game.game_id):
            doc_dir = document_dir(
                storage_dir, game.game_id, document.document_kind, document.doc_key
            )
            manifest_path = doc_dir / MANIFEST_FILE_NAME
            manifest = read_document_manifest(manifest_path)
            version = _manifest_version(manifest, "sectionMapVersion")
            pdf = source_pdf_path(
                storage_dir, game.game_id, document.document_kind, document.doc_key
            )
            layout_version = _manifest_version(manifest, "ingestLayoutVersion")
            if pdf.is_file() and layout_version < INGEST_LAYOUT_VERSION:
                continue

            path = chunks_path(storage_dir, game.game_id, document.document_kind, document.doc_key)
            chunks = read_chunks_jsonl(path)
            base = _strip_catalogue(chunks)
            enriched = enrich_chunks(base)
            rebuilt = enriched + build_catalogue_chunks(enriched)
            if version >= SECTION_MAP_VERSION and rebuilt == chunks:
                continue

            work = game_assets_dir(storage_dir, game.game_id) / f".section-tmp-{uuid.uuid4().hex}"
            tmp_doc = work / "documents" / document.document_kind / document.doc_key
            try:
                work.mkdir(parents=True, exist_ok=False)
                shutil.copytree(doc_dir, tmp_doc)
                write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, rebuilt)
                write_document_manifest(
                    tmp_doc / MANIFEST_FILE_NAME,
                    title=document.title,
                    kind=document.document_kind,
                    indexed_at=document.indexed_at,
                    section_map_version=SECTION_MAP_VERSION,
                    ingest_layout_version=layout_version if layout_version > 0 else None,
                )
                _promote_document(
                    storage_dir,
                    game.game_id,
                    document.document_kind,
                    document.doc_key,
                    tmp_doc,
                )
            finally:
                if work.exists():
                    shutil.rmtree(work, ignore_errors=True)

            maybe_index_document(
                storage_dir,
                game_id=game.game_id,
                kind=document.document_kind,
                doc_key=document.doc_key,
                chunks=rebuilt,
                indexed_at=document.indexed_at,
                ollama_url=settings.ollama_url,
                embedding_model=settings.profile.embedding,
            )
            recount_game(storage_dir, game.game_id)
            rewritten += 1
            _log(
                f"section map {game.game_id}/{document.doc_key}: "
                f"{len(chunks)} -> {len(rebuilt)} chunk(s)",
                progress,
            )
    return rewritten


def ensure_layout_ingest(
    storage_dir: Path,
    progress: ProgressCallback | None = None,
) -> int:
    """Re-extract PDF documents with the layout reader when the version is behind.

    Only touches documents that still have ``source.pdf``. Writes through a temp
    directory and swaps atomically — never mutates live ``chunks.jsonl`` in place.
    A ``pymupdf4llm`` fallback does not bump the version, so the next boot retries.
    """
    settings = get_settings()
    rewritten = 0
    for game in load_games(storage_dir):
        for document in list_game_documents(storage_dir, game.game_id):
            pdf = source_pdf_path(
                storage_dir, game.game_id, document.document_kind, document.doc_key
            )
            if not pdf.is_file():
                continue
            doc_dir = document_dir(
                storage_dir, game.game_id, document.document_kind, document.doc_key
            )
            manifest = read_document_manifest(doc_dir / MANIFEST_FILE_NAME)
            version = _manifest_version(manifest, "ingestLayoutVersion")
            if version >= INGEST_LAYOUT_VERSION:
                continue

            _log(
                f"re-reading layout for {game.game_id}/{document.doc_key}",
                progress,
            )
            work = game_assets_dir(storage_dir, game.game_id) / f".layout-tmp-{uuid.uuid4().hex}"
            tmp_doc = work / "documents" / document.document_kind / document.doc_key
            try:
                work.mkdir(parents=True, exist_ok=False)
                tmp_doc.mkdir(parents=True, exist_ok=True)
                chunks, reader = extract_pdf_chunks(
                    pdf,
                    game_id=game.game_id,
                    kind=document.document_kind,
                    doc_key=document.doc_key,
                    document_title=document.title,
                )
                if not chunks:
                    _log(
                        f"layout skipped {game.game_id}/{document.doc_key}: no chunks",
                        progress,
                    )
                    continue
                if reader != "layout":
                    _log(
                        f"layout fallback for {game.game_id}/{document.doc_key}; "
                        "keeping previous chunks and retrying next start",
                        progress,
                    )
                    continue
                write_chunks_jsonl(tmp_doc / CHUNKS_FILE_NAME, chunks)
                shutil.copy2(pdf, tmp_doc / SOURCE_PDF_NAME)
                render_page_pngs(pdf, tmp_doc)
                write_document_manifest(
                    tmp_doc / MANIFEST_FILE_NAME,
                    title=document.title,
                    kind=document.document_kind,
                    indexed_at=document.indexed_at,
                    section_map_version=SECTION_MAP_VERSION,
                    ingest_layout_version=INGEST_LAYOUT_VERSION,
                )
                _promote_document(
                    storage_dir,
                    game.game_id,
                    document.document_kind,
                    document.doc_key,
                    tmp_doc,
                )
                maybe_index_document(
                    storage_dir,
                    game_id=game.game_id,
                    kind=document.document_kind,
                    doc_key=document.doc_key,
                    chunks=chunks,
                    indexed_at=document.indexed_at,
                    ollama_url=settings.ollama_url,
                    embedding_model=settings.profile.embedding,
                )
                recount_game(storage_dir, game.game_id)
                rewritten += 1
                _log(
                    f"layout {game.game_id}/{document.doc_key} via {reader}: "
                    f"{len(chunks)} chunk(s)",
                    progress,
                )
            finally:
                if work.exists():
                    shutil.rmtree(work, ignore_errors=True)
    return rewritten


def rebuild_search_index(storage_dir: Path) -> int:
    """Re-embed every JSONL document. Returns the number of documents indexed."""
    settings = get_settings()
    indexed = 0
    for game in load_games(storage_dir):
        migrate_legacy_flat_pages(storage_dir, game.game_id)
        for document in list_game_documents(storage_dir, game.game_id):
            chunks = read_chunks_jsonl(
                chunks_path(storage_dir, game.game_id, document.document_kind, document.doc_key)
            )
            maybe_index_document(
                storage_dir,
                game_id=game.game_id,
                kind=document.document_kind,
                doc_key=document.doc_key,
                chunks=chunks,
                indexed_at=document.indexed_at,
                ollama_url=settings.ollama_url,
                embedding_model=settings.profile.embedding,
            )
            indexed += 1
    return indexed


def ensure_search_index(
    storage_dir: Path,
    progress: ProgressCallback | None = None,
) -> int:
    """Re-index games whose on-disk chunks outnumber the search index.

    Covers the case where a PDF was saved but embedding failed mid-import, so
    Ask would otherwise search an incomplete library until someone re-imports.
    Uses on-disk chunk counts (not a stale ``games.json`` count) and migrates
    Stage 2 flat layouts before deciding to skip. One failed embed does not
    stop the rest of the library.
    """
    from rag_engine.retrieval.indexer import IndexingError
    from rag_engine.retrieval.service import open_chunk_index

    index = open_chunk_index(storage_dir)
    if index is None:
        return 0
    settings = get_settings()
    fixed = 0
    for game in load_games(storage_dir):
        migrate_legacy_flat_pages(storage_dir, game.game_id)
        on_disk = count_chunks_for_game(storage_dir, game.game_id)
        if on_disk == 0:
            continue
        if on_disk != game.chunk_count:
            recount_game(storage_dir, game.game_id)
        indexed_rows = index.count_for_games([game.game_id])
        if indexed_rows >= on_disk:
            continue
        for document in list_game_documents(storage_dir, game.game_id):
            chunks = read_chunks_jsonl(
                chunks_path(storage_dir, game.game_id, document.document_kind, document.doc_key)
            )
            try:
                maybe_index_document(
                    storage_dir,
                    game_id=game.game_id,
                    kind=document.document_kind,
                    doc_key=document.doc_key,
                    chunks=chunks,
                    indexed_at=document.indexed_at,
                    ollama_url=settings.ollama_url,
                    embedding_model=settings.profile.embedding,
                )
            except IndexingError as error:
                _log(
                    f"search catch-up failed {game.game_id}/{document.doc_key}: {error}",
                    progress,
                )
                continue
            fixed += 1
            _log(
                f"search catch-up {game.game_id}/{document.doc_key}: "
                f"{indexed_rows} indexed rows, {on_disk} on disk",
                progress,
            )
    return fixed
