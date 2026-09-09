"""Lesson session store: one active per game, TTL, server-issued ids."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from rag_engine.lesson.session_store import (
    LESSON_TTL_SECONDS,
    create_session,
    get_active_for_game,
    load_session,
    save_session,
    touch_session,
)
from rag_engine.storage_paths import InvalidSessionIdError, lesson_session_path


def test_create_and_load_roundtrip(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    now = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)

    created = create_session(storage, "azul", ["azul-tiles"], now=now)
    loaded = load_session(storage, created.session_id)

    assert loaded is not None
    assert loaded.session_id == created.session_id
    assert loaded.game_id == "azul"
    assert loaded.expansion_ids == ["azul-tiles"]
    assert loaded.status == "planning"
    assert loaded.unit_index == 0
    assert loaded.syllabus == []
    assert loaded.turns == []
    assert loaded.updated_at == "2026-09-09T12:00:00Z"
    assert loaded.expires_at == "2026-09-12T12:00:00Z"

    on_disk = json.loads(
        (storage / "player" / "lessons" / "sessions" / f"{created.session_id}.json").read_text(
            encoding="utf-8"
        )
    )
    assert "sessionId" in on_disk
    assert "gameId" in on_disk


def test_second_create_supersedes_previous_active(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    now = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)

    first = create_session(storage, "azul", [], now=now)
    second = create_session(
        storage,
        "azul",
        [],
        now=now + timedelta(minutes=1),
    )

    assert first.session_id != second.session_id

    reloaded_first = load_session(storage, first.session_id)
    assert reloaded_first is not None
    assert reloaded_first.status == "completed"

    # Still planning — Continuie must not offer an empty plan.
    assert get_active_for_game(storage, "azul", now=now + timedelta(minutes=1)) is None
    assert load_session(storage, second.session_id) is not None


def test_get_active_hides_planning_and_empty_syllabus(tmp_path: Path) -> None:
    from rag_engine.contract import LessonSyllabusUnit

    storage = tmp_path / "storage"
    storage.mkdir()
    now = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)

    created = create_session(storage, "azul", [], now=now)
    assert get_active_for_game(storage, "azul", now=now) is None

    resumable = created.model_copy(
        update={
            "status": "active",
            "syllabus": [
                LessonSyllabusUnit(
                    unit_id="u00-setup",
                    title="Setup",
                    section_refs=["azul/main/setup"],
                )
            ],
        }
    )
    save_session(storage, resumable)

    active = get_active_for_game(storage, "azul", now=now)
    assert active is not None
    assert active.session_id == created.session_id


def test_get_active_expires_past_ttl(tmp_path: Path) -> None:
    from rag_engine.contract import LessonSyllabusUnit

    storage = tmp_path / "storage"
    storage.mkdir()
    start = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)

    created = create_session(storage, "azul", [], now=start)
    resumable = created.model_copy(
        update={
            "status": "active",
            "syllabus": [
                LessonSyllabusUnit(
                    unit_id="u00-setup",
                    title="Setup",
                    section_refs=["azul/main/setup"],
                )
            ],
        }
    )
    save_session(storage, resumable)

    active_before = get_active_for_game(storage, "azul", now=start + timedelta(hours=1))
    assert active_before is not None
    assert active_before.session_id == created.session_id

    after_ttl = start + timedelta(seconds=LESSON_TTL_SECONDS + 1)
    assert get_active_for_game(storage, "azul", now=after_ttl) is None

    expired = load_session(storage, created.session_id)
    assert expired is not None
    assert expired.status == "expired"


def test_path_helper_rejects_traversal_session_ids(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    with pytest.raises(InvalidSessionIdError):
        lesson_session_path(storage, "../evil")
    with pytest.raises(InvalidSessionIdError):
        load_session(storage, "../evil")


def test_load_unknown_session_returns_none(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    invented = "b" * 32

    assert load_session(storage, invented) is None
    assert get_active_for_game(storage, "azul") is None


def test_touch_session_extends_ttl(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    start = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)
    created = create_session(storage, "azul", [], now=start)

    later = start + timedelta(hours=10)
    touched = touch_session(created, now=later)
    save_session(storage, touched)

    reloaded = load_session(storage, created.session_id)
    assert reloaded is not None
    assert reloaded.updated_at == "2026-09-09T22:00:00Z"
    assert reloaded.expires_at == "2026-09-12T22:00:00Z"
