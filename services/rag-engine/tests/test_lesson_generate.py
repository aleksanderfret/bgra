from pathlib import Path

from rag_engine.contract import GameDocumentSummary, GameSummary, LessonSyllabusUnit
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pipeline import write_chunks_jsonl
from rag_engine.ingest.registry import save_games
from rag_engine.lesson.generate import (
    chunks_for_unit,
    parse_section_ref,
    records_to_retrieved,
    retrieval_question_for_unit,
)
from rag_engine.storage_paths import chunks_path, document_dir


def _seed_demo(storage: Path) -> None:
    game = GameSummary(
        game_id="demo",
        title="Demo",
        chunk_count=2,
        document_kinds=["rulebook"],
        indexed_at="2026-01-01T00:00:00Z",
        base_game_id=None,
        documents=[
            GameDocumentSummary(
                doc_key="main",
                document_kind="rulebook",
                title="Rulebook",
                chunk_count=2,
                indexed_at="2026-01-01T00:00:00Z",
            )
        ],
    )
    save_games(storage, [game])
    document_dir(storage, "demo", "rulebook", "main").mkdir(parents=True, exist_ok=True)
    write_chunks_jsonl(
        chunks_path(storage, "demo", "rulebook", "main"),
        [
            ChunkRecord(
                id="demo:rulebook:main:p01:c00",
                game_id="demo",
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                page=1,
                text="Setup the board.",
                heading="Setup",
                section_id="setup",
                block_kind="rule",
            ),
            ChunkRecord(
                id="demo:rulebook:main:p03:c00",
                game_id="demo",
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                page=3,
                text="Take one action.",
                heading="Actions",
                section_id="actions",
                block_kind="rule",
            ),
        ],
    )


def test_parse_section_ref() -> None:
    assert parse_section_ref("demo/main/setup") == ("demo", "main", "setup")
    assert parse_section_ref("bad") is None
    assert parse_section_ref("a/b/") is None


def test_chunks_for_unit_matches_section_refs(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _seed_demo(storage)
    unit = LessonSyllabusUnit(
        unit_id="u00-setup",
        title="Setup",
        section_refs=["demo/main/setup"],
    )
    matched = chunks_for_unit(storage, unit, ["demo"])
    assert len(matched) == 1
    assert matched[0].section_id == "setup"
    retrieved = records_to_retrieved(matched)
    assert retrieved[0].indexed_at == ""
    assert retrieved[0].text == "Setup the board."


def test_chunks_for_unit_empty_when_no_match(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _seed_demo(storage)
    unit = LessonSyllabusUnit(
        unit_id="u99",
        title="Missing",
        section_refs=["demo/main/nope"],
    )
    assert chunks_for_unit(storage, unit, ["demo"]) == []


def test_retrieval_question_includes_title() -> None:
    unit = LessonSyllabusUnit(
        unit_id="u00",
        title="Setup",
        section_refs=["demo/main/example-turn"],
    )
    question = retrieval_question_for_unit(unit)
    assert "Setup" in question
    assert "example" in question
