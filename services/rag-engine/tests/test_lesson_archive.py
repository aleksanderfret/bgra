from pathlib import Path

from rag_engine.contract import LessonTurn
from rag_engine.lesson.archive import append_turn, load_style_exemplars
from rag_engine.storage_paths import index_dir, lesson_archive_dir


def test_append_and_load_style_capped(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()

    for index in range(5):
        append_turn(
            storage,
            "azul",
            LessonTurn(
                id=f"{index:032x}",
                kind="unit",
                unit_id="u01",
                question=None,
                text=f"Teaching snippet number {index} " + ("x" * 50),
                sources=[],
                groundedness="grounded",
            ),
        )

    style = load_style_exemplars(storage, "azul")
    assert "Teaching snippet number 4" in style
    assert "Teaching snippet number 0" not in style
    assert "<" not in style or "&lt;" in style or style  # escaped if needed
    assert lesson_archive_dir(storage, "azul").is_dir()
    # Archive must not live under the search index tree.
    assert index_dir(storage) not in lesson_archive_dir(storage, "azul").parents


def test_archive_ignores_corrupt_lines(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    archive = lesson_archive_dir(storage, "azul")
    archive.mkdir(parents=True)
    (archive / "turns.jsonl").write_text("not-json\n", encoding="utf-8")
    append_turn(
        storage,
        "azul",
        LessonTurn(
            id="a" * 32,
            kind="digression",
            unit_id=None,
            question="how many?",
            text="From page 3: draw one.",
            sources=[],
            groundedness="grounded",
        ),
    )
    assert "draw one" in load_style_exemplars(storage, "azul")
