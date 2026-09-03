from pathlib import Path

import pytest

from rag_engine.settings import ensure_storage_writable


def test_ensure_storage_writable_creates_the_directory(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "storage"
    ensure_storage_writable(target)
    assert target.is_dir()


def test_ensure_storage_writable_rejects_a_file_path(tmp_path: Path) -> None:
    blocker = tmp_path / "not-a-dir"
    blocker.write_text("x", encoding="utf-8")

    with pytest.raises(SystemExit, match="not writable"):
        ensure_storage_writable(blocker)
