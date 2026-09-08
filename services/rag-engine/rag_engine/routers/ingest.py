"""HTTP upload of a rulebook PDF (browser → Next proxy → here)."""

from __future__ import annotations

import asyncio
import logging
import queue
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from rag_engine.contract import (
    ErrorEvent,
    GameSummary,
    IngestDoneEvent,
    IngestProgressEvent,
)
from rag_engine.ingest.ingest_percent import ingest_percent
from rag_engine.ingest.pdf import (
    MAX_PDF_BYTES,
    IngestExtraMissingError,
    PageImageLimitError,
    PdfLimitError,
)
from rag_engine.ingest.pipeline import (
    ProgressTick,
    ensure_search_index,
    ingest_rulebook,
    rebuild_search_index,
)
from rag_engine.ingest.registry import load_games
from rag_engine.retrieval.indexer import IndexingError
from rag_engine.settings import Settings, get_settings
from rag_engine.sse import SSE_HEADERS, SSE_MEDIA_TYPE, encode_event
from rag_engine.storage_paths import (
    InvalidDocKeyError,
    InvalidGameIdError,
    assert_doc_key,
    assert_game_id,
    slugify_doc_key,
)

router = APIRouter(tags=["library"])
_logger = logging.getLogger(__name__)

_PDF_MAGIC = b"%PDF"
_INGEST_LOCK = asyncio.Lock()
_INGEST_BUSY = False


async def _try_begin_ingest() -> bool:
    global _INGEST_BUSY
    async with _INGEST_LOCK:
        if _INGEST_BUSY:
            return False
        _INGEST_BUSY = True
        return True


async def _end_ingest() -> None:
    global _INGEST_BUSY
    async with _INGEST_LOCK:
        _INGEST_BUSY = False


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"type": "error", "code": code, "message": message},
    )


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


async def _write_pdf_upload(upload: UploadFile, dest: Path) -> None:
    written = 0
    header = b""
    with dest.open("wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            if written == 0:
                header = chunk[:8]
            written += len(chunk)
            if written > MAX_PDF_BYTES:
                raise PdfLimitError(
                    f"PDF is {written} bytes; maximum allowed is {MAX_PDF_BYTES} bytes (80 MB)."
                )
            out.write(chunk)
    if written == 0 or not header.startswith(_PDF_MAGIC):
        raise ValueError("Uploaded file is not a PDF.")


def _ingest_error_event(error: BaseException) -> ErrorEvent:
    if isinstance(error, InvalidGameIdError):
        return ErrorEvent(code="invalid_game_id", message=str(error))
    if isinstance(error, InvalidDocKeyError):
        return ErrorEvent(code="invalid_doc_key", message=str(error))
    if isinstance(error, PageImageLimitError):
        return ErrorEvent(code="page_image_too_large", message=str(error))
    if isinstance(error, PdfLimitError):
        return ErrorEvent(code="limit_exceeded", message=str(error))
    if isinstance(error, ValueError):
        return ErrorEvent(code="invalid_file", message=str(error))
    if isinstance(error, IngestExtraMissingError):
        return ErrorEvent(code="ingest_not_ready", message=str(error))
    if isinstance(error, IndexingError):
        return ErrorEvent(code="index_failed", message=str(error))
    _logger.exception("PDF ingest failed")
    return ErrorEvent(code="ingest_failed", message=str(error))


@router.post("/ingest/pdf", response_model=None)
async def ingest_pdf_upload(
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
    game_id: Annotated[str, Form(alias="gameId")],
    title: Annotated[str, Form()] = "",
    document_title: Annotated[str, Form(alias="documentTitle")] = "",
    doc_key: Annotated[str, Form(alias="docKey")] = "",
    base_game_id: Annotated[str, Form(alias="baseGameId")] = "",
    mode: Annotated[str, Form()] = "create",
    fetch_community_faq: Annotated[str, Form(alias="fetchCommunityFaq")] = "false",
) -> StreamingResponse | JSONResponse:
    if not await _try_begin_ingest():
        await file.close()
        return _error(409, "ingest_busy", "Another PDF import is already running.")

    display_title = title.strip() or game_id
    resolved_document_title = document_title.strip()
    resolved_doc_key = doc_key.strip() or None
    resolved_base = base_game_id.strip() or None
    attach = mode.strip().lower() == "attach"

    try:
        assert_game_id(game_id)
        if resolved_base is not None:
            assert_game_id(resolved_base)
    except InvalidGameIdError as error:
        await file.close()
        await _end_ingest()
        return _error(400, "invalid_game_id", str(error))

    if attach:
        known = {game.game_id for game in load_games(settings.storage_dir)}
        if game_id not in known:
            await file.close()
            await _end_ingest()
            return _error(400, "unknown_game", f"No game {game_id!r} in the library yet.")
        if not resolved_document_title:
            await file.close()
            await _end_ingest()
            return _error(
                400,
                "invalid_document_title",
                "Document title is required when attaching.",
            )
        if resolved_doc_key is None:
            resolved_doc_key = slugify_doc_key(resolved_document_title)
    else:
        if not resolved_document_title:
            resolved_document_title = "Rulebook"
        if resolved_doc_key is None:
            resolved_doc_key = (
                "main"
                if resolved_document_title.lower() in {"rulebook", "instrukcja"}
                else slugify_doc_key(resolved_document_title)
            )

    try:
        if resolved_doc_key is not None:
            assert_doc_key(resolved_doc_key)
    except InvalidDocKeyError as error:
        await file.close()
        await _end_ingest()
        return _error(400, "invalid_doc_key", str(error))

    if resolved_base == game_id:
        await file.close()
        await _end_ingest()
        return _error(400, "invalid_base_game", "An expansion cannot list itself as its base.")

    if resolved_base:
        bases = {
            game.game_id for game in load_games(settings.storage_dir) if game.base_game_id is None
        }
        if resolved_base not in bases:
            await file.close()
            await _end_ingest()
            return _error(
                400,
                "invalid_base_game",
                f"Base game {resolved_base!r} is missing or is itself an expansion.",
            )

    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        await _write_pdf_upload(file, tmp_path)
    except PdfLimitError as error:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        await file.close()
        await _end_ingest()
        if isinstance(error, PageImageLimitError):
            return _error(413, "page_image_too_large", str(error))
        return _error(413, "limit_exceeded", str(error))
    except ValueError as error:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        await file.close()
        await _end_ingest()
        return _error(400, "invalid_file", str(error))

    saved_pdf = tmp_path
    progress_queue: queue.Queue[ProgressTick | GameSummary | BaseException] = queue.Queue()

    def on_progress(tick: ProgressTick) -> None:
        progress_queue.put(tick)

    def worker() -> None:
        try:
            summary = ingest_rulebook(
                settings.storage_dir,
                game_id=game_id,
                pdf_path=saved_pdf,
                title=display_title,
                document_title=resolved_document_title,
                doc_key=resolved_doc_key,
                base_game_id=resolved_base,
                fetch_community_faq=_truthy(fetch_community_faq),
                progress=on_progress,
            )
            progress_queue.put(summary)
        except BaseException as error:
            progress_queue.put(error)

    async def generate() -> AsyncIterator[str]:
        worker_task = asyncio.create_task(asyncio.to_thread(worker))
        try:
            yield encode_event(
                IngestProgressEvent(
                    stage="saving",
                    current=1,
                    total=1,
                    percent=ingest_percent("saving", 1, 1),
                )
            )
            while True:
                item = await asyncio.to_thread(progress_queue.get)
                if isinstance(item, ProgressTick):
                    yield encode_event(
                        IngestProgressEvent(
                            stage=item.stage,
                            current=item.current,
                            total=item.total,
                            percent=ingest_percent(item.stage, item.current, item.total),
                        )
                    )
                    continue
                if isinstance(item, GameSummary):
                    yield encode_event(IngestDoneEvent(game=item))
                    break
                yield encode_event(_ingest_error_event(item))
                break
        finally:
            await worker_task
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)
            await file.close()
            await _end_ingest()

    return StreamingResponse(generate(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


@router.post("/ingest/reindex", response_model=None)
async def reindex_search(
    settings: Annotated[Settings, Depends(get_settings)],
    full: Annotated[bool, Query()] = False,
) -> JSONResponse:
    """Add on-disk documents to search without re-importing the PDF."""
    if not await _try_begin_ingest():
        return _error(409, "ingest_busy", "Another PDF import is already running.")
    try:
        if full:
            count = await asyncio.to_thread(rebuild_search_index, settings.storage_dir)
        else:
            count = await asyncio.to_thread(ensure_search_index, settings.storage_dir)
        return JSONResponse({"ok": True, "documentsIndexed": count})
    except IndexingError as error:
        return _error(503, "index_failed", str(error))
    except Exception as error:
        _logger.exception("Search reindex failed")
        return _error(500, "ingest_failed", str(error))
    finally:
        await _end_ingest()
