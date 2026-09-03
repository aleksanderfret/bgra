"""HTTP upload of a rulebook PDF (browser → Next proxy → here)."""

from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from rag_engine.contract import GameSummary
from rag_engine.ingest.pdf import (
    MAX_PDF_BYTES,
    IngestExtraMissingError,
    PageImageLimitError,
    PdfLimitError,
)
from rag_engine.ingest.pipeline import ingest_rulebook
from rag_engine.settings import Settings, get_settings
from rag_engine.storage_paths import InvalidGameIdError

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


@router.post("/ingest/pdf", response_model=None)
async def ingest_pdf_upload(
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
    game_id: Annotated[str, Form(alias="gameId")],
    title: Annotated[str, Form()] = "",
    fetch_community_faq: Annotated[str, Form(alias="fetchCommunityFaq")] = "false",
) -> GameSummary | JSONResponse:
    if not await _try_begin_ingest():
        await file.close()
        return _error(409, "ingest_busy", "Another PDF import is already running.")

    display_title = title.strip() or game_id
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        await _write_pdf_upload(file, tmp_path)
        summary = await asyncio.to_thread(
            ingest_rulebook,
            settings.storage_dir,
            game_id=game_id,
            pdf_path=tmp_path,
            title=display_title,
            fetch_community_faq=_truthy(fetch_community_faq),
        )
        return summary
    except InvalidGameIdError as error:
        return _error(400, "invalid_game_id", str(error))
    except PdfLimitError as error:
        if isinstance(error, PageImageLimitError):
            return _error(413, "page_image_too_large", str(error))
        return _error(413, "limit_exceeded", str(error))
    except ValueError as error:
        return _error(400, "invalid_file", str(error))
    except IngestExtraMissingError as error:
        return _error(503, "ingest_not_ready", str(error))
    except Exception as error:
        _logger.exception("PDF ingest failed")
        return _error(500, "ingest_failed", str(error))
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        await file.close()
        await _end_ingest()
