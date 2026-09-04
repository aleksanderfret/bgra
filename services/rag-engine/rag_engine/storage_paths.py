"""All paths under storage go through here (D13).

`game_id` is both a retrieval filter and a directory name, so every join is
resolved and checked to stay under `storage_dir` before anything is created.
"""

from __future__ import annotations

import re
from pathlib import Path

from rag_engine.contract import DOC_KEY_PATTERN, GAME_ID_PATTERN, DocumentKind

_GAME_ID_RE = re.compile(GAME_ID_PATTERN)
_DOC_KEY_RE = re.compile(DOC_KEY_PATTERN)

# Fixed names — never take a filename from the user's PDF.
SOURCE_PDF_NAME = "source.pdf"
CHUNKS_FILE_NAME = "chunks.jsonl"
MANIFEST_FILE_NAME = "manifest.json"


class InvalidGameIdError(ValueError):
    pass


class InvalidDocKeyError(ValueError):
    pass


class StoragePathEscapeError(ValueError):
    pass


def assert_game_id(game_id: str) -> str:
    if not _GAME_ID_RE.fullmatch(game_id):
        raise InvalidGameIdError(
            f"Invalid game id {game_id!r}. Use a lowercase slug: letters, digits and hyphens only."
        )
    return game_id


def assert_doc_key(doc_key: str) -> str:
    if not _DOC_KEY_RE.fullmatch(doc_key):
        raise InvalidDocKeyError(
            f"Invalid document key {doc_key!r}. "
            "Use a lowercase slug: letters, digits and hyphens only."
        )
    return doc_key


def assert_under_storage(path: Path, storage_dir: Path) -> Path:
    resolved = path.resolve()
    root = storage_dir.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise StoragePathEscapeError(f"Path {resolved} escapes storage root {root}.") from error
    return resolved


def assets_dir(storage_dir: Path) -> Path:
    return assert_under_storage(storage_dir / "assets", storage_dir)


def game_assets_dir(storage_dir: Path, game_id: str) -> Path:
    assert_game_id(game_id)
    return assert_under_storage(assets_dir(storage_dir) / game_id, storage_dir)


def document_dir(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
) -> Path:
    assert_game_id(game_id)
    assert_doc_key(doc_key)
    return assert_under_storage(
        game_assets_dir(storage_dir, game_id) / "documents" / kind / doc_key,
        storage_dir,
    )


def page_png_path(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
    page: int,
) -> Path:
    if page < 1:
        raise ValueError(f"Page number must be >= 1, got {page}.")
    return assert_under_storage(
        document_dir(storage_dir, game_id, kind, doc_key) / f"p{page:02d}.png",
        storage_dir,
    )


def page_image_url(game_id: str, kind: DocumentKind, doc_key: str, page: int) -> str:
    assert_game_id(game_id)
    assert_doc_key(doc_key)
    if page < 1:
        raise ValueError(f"Page number must be >= 1, got {page}.")
    return f"/static/assets/{game_id}/documents/{kind}/{doc_key}/p{page:02d}.png"


def chunks_path(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
) -> Path:
    return assert_under_storage(
        document_dir(storage_dir, game_id, kind, doc_key) / CHUNKS_FILE_NAME,
        storage_dir,
    )


def source_pdf_path(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
) -> Path:
    return assert_under_storage(
        document_dir(storage_dir, game_id, kind, doc_key) / SOURCE_PDF_NAME,
        storage_dir,
    )


def manifest_path(
    storage_dir: Path,
    game_id: str,
    kind: DocumentKind,
    doc_key: str,
) -> Path:
    return assert_under_storage(
        document_dir(storage_dir, game_id, kind, doc_key) / MANIFEST_FILE_NAME,
        storage_dir,
    )


def games_registry_path(storage_dir: Path) -> Path:
    return assert_under_storage(storage_dir / "games.json", storage_dir)


def index_dir(storage_dir: Path) -> Path:
    return assert_under_storage(storage_dir / "index", storage_dir)


def slugify_doc_key(title: str, *, fallback: str = "main") -> str:
    """Turn a human document title into a safe doc_key slug."""
    lowered = title.strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    if not cleaned:
        cleaned = fallback
    if len(cleaned) > 64:
        cleaned = cleaned[:64].rstrip("-")
    if not _DOC_KEY_RE.fullmatch(cleaned):
        cleaned = fallback
    return cleaned
