from rag_engine.pull_models import ollama_fields
from rag_engine.settings import PROFILES


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
