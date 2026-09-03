from pathlib import Path
from unittest.mock import patch

import pytest

from rag_engine.pull_models import ollama_fields, pull_profile
from rag_engine.settings import PROFILES, Settings


def test_ollama_fields_skip_absent_optional_models() -> None:
    fields = dict(ollama_fields(PROFILES["minimal-16gb"]))
    assert "llm" in fields
    assert "embedding" in fields
    assert "llm_arbiter" not in fields
    assert "vision" not in fields


def test_full_profile_lists_arbiter_and_vision() -> None:
    fields = dict(ollama_fields(PROFILES["full-64gb"]))
    assert "llm_arbiter" in fields
    assert "vision" in fields


def test_pull_profile_warns_when_tag_missing_after_pull(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = Settings(storage_dir=tmp_path, model_profile="minimal-16gb")

    with (
        patch("rag_engine.pull_models.pull_ollama_model"),
        patch("rag_engine.pull_models.ollama_tags", return_value={"bge-m3"}),
    ):
        pull_profile(settings, skip_huggingface=True)

    captured = capsys.readouterr()
    assert "WARNING" in captured.out
    assert "qwen3:8b" in captured.out


def test_pull_profile_confirms_when_all_present(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = Settings(storage_dir=tmp_path, model_profile="minimal-16gb")

    with (
        patch("rag_engine.pull_models.pull_ollama_model"),
        patch("rag_engine.pull_models.ollama_tags", return_value={"qwen3:8b", "bge-m3"}),
    ):
        pull_profile(settings, skip_huggingface=True)

    captured = capsys.readouterr()
    assert "verified as installed" in captured.out
