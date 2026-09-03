from pathlib import Path

import pytest

from rag_engine.storage_paths import (
    InvalidDocKeyError,
    InvalidGameIdError,
    StoragePathEscapeError,
    assert_game_id,
    assert_under_storage,
    chunks_path,
    document_dir,
    game_assets_dir,
    page_image_url,
    page_png_path,
    slugify_doc_key,
)


def test_assert_game_id_accepts_slugs() -> None:
    assert assert_game_id("azul") == "azul"
    assert assert_game_id("brass-birmingham") == "brass-birmingham"


@pytest.mark.parametrize(
    "game_id",
    ["../x", "Azul", "azul/rulebook", "..", "azul\x00", ""],
)
def test_assert_game_id_rejects_non_slugs(game_id: str) -> None:
    with pytest.raises(InvalidGameIdError):
        assert_game_id(game_id)


def test_paths_stay_under_storage(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()

    game_dir = game_assets_dir(storage, "azul")
    assert game_dir == (storage / "assets" / "azul").resolve()

    png = page_png_path(storage, "azul", "rulebook", "main", 4)
    assert png.name == "p04.png"
    assert "documents/rulebook/main" in str(png)

    doc = document_dir(storage, "azul", "rulebook", "main")
    assert doc.name == "main"

    chunks = chunks_path(storage, "azul", "rulebook", "main")
    assert chunks.name == "chunks.jsonl"


def test_assert_under_storage_rejects_escape(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("nope", encoding="utf-8")

    with pytest.raises(StoragePathEscapeError):
        assert_under_storage(outside, storage)


def test_document_key_rejects_path_segments(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    with pytest.raises(InvalidDocKeyError):
        document_dir(storage, "azul", "rulebook", "../evil")


def test_page_image_url_is_engine_relative() -> None:
    assert (
        page_image_url("azul", "rulebook", "main", 4)
        == "/static/assets/azul/documents/rulebook/main/p04.png"
    )


def test_slugify_doc_key() -> None:
    assert slugify_doc_key("Solo mode") == "solo-mode"
    assert slugify_doc_key("  ") == "main"
