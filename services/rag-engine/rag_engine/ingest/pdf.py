"""PDF → Markdown + page PNGs, with hard size limits."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

MAX_PDF_BYTES = 80 * 1024 * 1024
MAX_PDF_PAGES = 200
MAX_PNG_BYTES = 2 * 1024 * 1024
RENDER_DPI = 150


class PdfLimitError(ValueError):
    pass


class IngestExtraMissingError(RuntimeError):
    pass


@dataclass(frozen=True)
class PdfExtractResult:
    markdown: str
    page_count: int


def assert_pdf_limits(pdf_path: Path) -> None:
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    size = pdf_path.stat().st_size
    if size > MAX_PDF_BYTES:
        raise PdfLimitError(
            f"PDF is {size} bytes; maximum allowed is {MAX_PDF_BYTES} bytes (80 MB)."
        )


def extract_markdown(pdf_path: Path) -> PdfExtractResult:
    assert_pdf_limits(pdf_path)
    try:
        import pymupdf
        import pymupdf4llm
    except ImportError as error:
        raise IngestExtraMissingError(
            "PDF ingestion requires the ingest extra. Run: uv sync --extra ingest"
        ) from error

    with pymupdf.open(pdf_path) as document:  # type: ignore[no-untyped-call,unused-ignore]
        page_count = document.page_count
        if page_count > MAX_PDF_PAGES:
            raise PdfLimitError(f"PDF has {page_count} pages; maximum allowed is {MAX_PDF_PAGES}.")
        if page_count < 1:
            raise PdfLimitError("PDF has no pages.")

    # page_chunks=True yields one dict per page with text + metadata.page_number.
    pages = pymupdf4llm.to_markdown(str(pdf_path), page_chunks=True)
    parts: list[str] = []
    if isinstance(pages, list):
        for entry in pages:
            if isinstance(entry, dict):
                text = str(entry.get("text", ""))
                meta = entry.get("metadata") or {}
                page_number = int(meta.get("page_number") or (len(parts) // 2 + 1))
            else:
                text = str(entry)
                page_number = len(parts) // 2 + 1
            parts.append(f"----- {page_number} -----")
            parts.append(text)
    else:
        parts.append(str(pages))

    return PdfExtractResult(markdown="\n".join(parts), page_count=page_count)


def render_page_pngs(pdf_path: Path, output_dir: Path) -> list[Path]:
    assert_pdf_limits(pdf_path)
    try:
        import pymupdf
    except ImportError as error:
        raise IngestExtraMissingError(
            "PDF ingestion requires the ingest extra. Run: uv sync --extra ingest"
        ) from error

    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    zoom = RENDER_DPI / 72.0
    matrix = pymupdf.Matrix(zoom, zoom)  # type: ignore[no-untyped-call,unused-ignore]

    with pymupdf.open(pdf_path) as document:  # type: ignore[no-untyped-call,unused-ignore]
        if document.page_count > MAX_PDF_PAGES:
            raise PdfLimitError(
                f"PDF has {document.page_count} pages; maximum allowed is {MAX_PDF_PAGES}."
            )
        for index in range(document.page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            target = output_dir / f"p{index + 1:02d}.png"
            png_bytes = pixmap.tobytes("png")
            if len(png_bytes) > MAX_PNG_BYTES:
                raise PdfLimitError(
                    f"Rendered page {index + 1} is {len(png_bytes)} bytes; "
                    f"maximum allowed is {MAX_PNG_BYTES} bytes (2 MB)."
                )
            target.write_bytes(png_bytes)
            written.append(target)

    return written
