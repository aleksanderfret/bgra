"""Persist lesson sessions under storage/player/lessons (D13).

Session ids are server-issued uuid4 hex values. One active session per gameId;
creating a new one completes (supersedes) the previous active session.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic import ValidationError

from rag_engine.contract import LessonSession
from rag_engine.storage_paths import (
    assert_game_id,
    lesson_active_pointer_path,
    lesson_session_path,
)

LESSON_TTL_SECONDS = 72 * 3600

_TERMINAL_STATUSES = frozenset({"completed", "expired"})


def _utc_now(now: datetime | None) -> datetime:
    if now is None:
        return datetime.now(UTC)
    if now.tzinfo is None:
        return now.replace(tzinfo=UTC)
    return now.astimezone(UTC)


def _format_ts(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_ts(value: str) -> datetime:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    return datetime.fromisoformat(cleaned).astimezone(UTC)


def touch_session(session: LessonSession, *, now: datetime | None = None) -> LessonSession:
    moment = _utc_now(now)
    return session.model_copy(
        update={
            "updated_at": _format_ts(moment),
            "expires_at": _format_ts(moment + timedelta(seconds=LESSON_TTL_SECONDS)),
        }
    )


def save_session(storage_dir: Path, session: LessonSession) -> None:
    path = lesson_session_path(storage_dir, session.session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = session.model_dump(by_alias=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def load_session(storage_dir: Path, session_id: str) -> LessonSession | None:
    path = lesson_session_path(storage_dir, session_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return LessonSession.model_validate(payload)
    except OSError, json.JSONDecodeError, ValidationError:
        return None


def mark_superseded(
    storage_dir: Path,
    session: LessonSession,
    *,
    now: datetime | None = None,
) -> LessonSession:
    moment = _utc_now(now)
    updated = session.model_copy(
        update={
            "status": "completed",
            "updated_at": _format_ts(moment),
        }
    )
    save_session(storage_dir, updated)
    return updated


def _write_active_pointer(storage_dir: Path, game_id: str, session_id: str) -> None:
    path = lesson_active_pointer_path(storage_dir, game_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"sessionId": session_id}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _read_active_session_id(storage_dir: Path, game_id: str) -> str | None:
    path = lesson_active_pointer_path(storage_dir, game_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError, json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    session_id = payload.get("sessionId")
    if not isinstance(session_id, str) or not session_id:
        return None
    return session_id


def _clear_active_pointer(storage_dir: Path, game_id: str) -> None:
    path = lesson_active_pointer_path(storage_dir, game_id)
    path.unlink(missing_ok=True)


def get_active_for_game(
    storage_dir: Path,
    game_id: str,
    *,
    now: datetime | None = None,
) -> LessonSession | None:
    assert_game_id(game_id)
    moment = _utc_now(now)
    session_id = _read_active_session_id(storage_dir, game_id)
    if session_id is None:
        return None

    session = load_session(storage_dir, session_id)
    if session is None:
        _clear_active_pointer(storage_dir, game_id)
        return None

    if session.status in _TERMINAL_STATUSES:
        _clear_active_pointer(storage_dir, game_id)
        return None

    # Planning never finished — do not offer Continuie on an empty plan.
    if session.status == "planning" or not session.syllabus:
        return None

    if moment >= _parse_ts(session.expires_at):
        expired = session.model_copy(
            update={
                "status": "expired",
                "updated_at": _format_ts(moment),
            }
        )
        save_session(storage_dir, expired)
        _clear_active_pointer(storage_dir, game_id)
        return None

    return session


def create_session(
    storage_dir: Path,
    game_id: str,
    expansion_ids: list[str],
    *,
    now: datetime | None = None,
    session_id: str | None = None,
) -> LessonSession:
    assert_game_id(game_id)
    moment = _utc_now(now)

    # Supersede whatever the active pointer names — including planning sessions
    # that get_active_for_game deliberately hides from Continuie.
    previous_id = _read_active_session_id(storage_dir, game_id)
    if previous_id is not None:
        previous = load_session(storage_dir, previous_id)
        if previous is not None and previous.status not in _TERMINAL_STATUSES:
            mark_superseded(storage_dir, previous, now=moment)

    resolved_id = session_id if session_id is not None else uuid.uuid4().hex
    session = LessonSession(
        session_id=resolved_id,
        game_id=game_id,
        expansion_ids=list(expansion_ids),
        syllabus=[],
        unit_index=0,
        status="planning",
        updated_at=_format_ts(moment),
        expires_at=_format_ts(moment + timedelta(seconds=LESSON_TTL_SECONDS)),
        turns=[],
    )
    save_session(storage_dir, session)
    _write_active_pointer(storage_dir, game_id, session.session_id)
    return session
