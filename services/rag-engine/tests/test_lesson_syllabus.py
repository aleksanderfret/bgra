from pathlib import Path

import pytest

from rag_engine.contract import GameDocumentSummary, GameSummary
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pipeline import write_chunks_jsonl
from rag_engine.ingest.registry import save_games
from rag_engine.lesson.syllabus import LessonPlanError, build_syllabus, collect_sections
from rag_engine.storage_paths import chunks_path, document_dir


def _write_rulebook(storage: Path, *, headings: list[tuple[str, str, int | None]]) -> None:
    game = GameSummary(
        game_id="demo",
        title="Demo",
        chunk_count=len(headings),
        document_kinds=["rulebook"],
        indexed_at="2026-01-01T00:00:00Z",
        base_game_id=None,
        documents=[
            GameDocumentSummary(
                doc_key="main",
                document_kind="rulebook",
                title="Rulebook",
                chunk_count=len(headings),
                indexed_at="2026-01-01T00:00:00Z",
            )
        ],
    )
    save_games(storage, [game])
    document_dir(storage, "demo", "rulebook", "main").mkdir(parents=True, exist_ok=True)
    chunks = [
        ChunkRecord(
            id=f"demo:rulebook:main:p{(page or 1):02d}:c{index:02d}",
            game_id="demo",
            document_kind="rulebook",
            doc_key="main",
            document_title="Rulebook",
            page=page,
            text=f"Text for {title}",
            heading=title,
            section_id=section_id,
            block_kind="rule",
        )
        for index, (section_id, title, page) in enumerate(headings)
    ]
    write_chunks_jsonl(chunks_path(storage, "demo", "rulebook", "main"), chunks)


def test_build_syllabus_uses_real_section_refs(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _write_rulebook(
        storage,
        headings=[
            ("setup", "Setup", 1),
            ("actions", "Actions", 3),
            ("example-turn", "Example turn", 8),
        ],
    )

    syllabus = build_syllabus(storage, ["demo"])

    assert [unit.title for unit in syllabus] == ["Setup", "Actions", "Example turn"]
    assert all(unit.section_refs for unit in syllabus)
    assert syllabus[0].spine_hint == "goal"
    assert syllabus[1].spine_hint == "mechanics"
    assert syllabus[2].spine_hint == "sample_move"
    assert syllabus[0].section_refs == ["demo/main/setup"]


def test_goal_sections_are_promoted_when_buried_early(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _write_rulebook(
        storage,
        headings=[
            ("flavour", "A short story", 1),
            ("setup", "Setup", 2),
            ("actions", "Actions", 4),
        ],
    )

    titles = [unit.title for unit in build_syllabus(storage, ["demo"])]

    assert titles[0] == "Setup"
    assert "A short story" in titles


def test_empty_library_raises_plan_error(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    save_games(storage, [])

    with pytest.raises(LessonPlanError):
        build_syllabus(storage, ["missing"])


def test_collect_sections_skips_catalogue_and_blank_headings(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _write_rulebook(storage, headings=[("setup", "Setup", 1)])
    path = chunks_path(storage, "demo", "rulebook", "main")
    chunks = [
        ChunkRecord(
            id="demo:rulebook:main:catalogue:c00",
            game_id="demo",
            document_kind="rulebook",
            doc_key="main",
            text="Section catalogue",
            heading="Contents",
            section_id="catalogue",
            block_kind="catalogue",
        ),
        ChunkRecord(
            id="demo:rulebook:main:p02:c00",
            game_id="demo",
            document_kind="rulebook",
            doc_key="main",
            text="orphan",
            heading="",
            section_id="",
            block_kind="rule",
        ),
    ]
    from rag_engine.ingest.pipeline import read_chunks_jsonl, write_chunks_jsonl

    existing = read_chunks_jsonl(path)
    write_chunks_jsonl(path, existing + chunks)

    sections = collect_sections(storage, ["demo"])
    assert [section.title for section in sections] == ["Setup"]


def test_adjacent_same_spine_sections_merge(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    _write_rulebook(
        storage,
        headings=[
            ("setup", "Setup", 1),
            ("components", "Components", 2),
            ("actions", "Actions", 4),
        ],
    )

    syllabus = build_syllabus(storage, ["demo"])

    assert len(syllabus) == 2
    assert syllabus[0].spine_hint == "goal"
    assert "Setup" in syllabus[0].title
    assert "Components" in syllabus[0].title
    assert syllabus[1].title == "Actions"
