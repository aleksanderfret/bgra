from rag_engine.lesson.prompts import build_digression_messages, build_teach_messages
from rag_engine.retrieval.types import RetrievedChunk


def _chunk(**overrides: object) -> RetrievedChunk:
    payload: dict[str, object] = {
        "id": "demo:rulebook:main:p01:c00",
        "game_id": "demo",
        "document_kind": "rulebook",
        "doc_key": "main",
        "document_title": "Demo",
        "page": 1,
        "text": "Place the board in the centre.",
        "heading": "Setup",
        "indexed_at": "",
        "score": 0.9,
    }
    payload.update(overrides)
    return RetrievedChunk.model_validate(payload)


def test_teach_messages_include_wrap_and_unit_title() -> None:
    messages = build_teach_messages(
        "Setup",
        covered_titles=["Goal"],
        chunks=[_chunk()],
        question_language_hint="How do I set up?",
    )
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    system = messages[0]["content"]
    assert "<source " in system
    assert "Place the board in the centre." in system
    assert "Setup" in system
    assert "Goal" in system
    assert "</source>" in system
    assert messages[1]["role"] == "user"
    assert "Setup" in messages[1]["content"]


def test_digression_messages_differ_from_teach() -> None:
    chunks = [_chunk()]
    teach = build_teach_messages("Setup", [], chunks, "Teach setup")
    digression = build_digression_messages("Can I take two actions?", chunks)
    assert teach[0]["content"] != digression[0]["content"]
    digression_system = digression[0]["content"].lower()
    assert "short" in digression_system or "ruling" in digression_system
    assert digression[1]["content"] == "Can I take two actions?"
    assert "<source " in digression[0]["content"]
