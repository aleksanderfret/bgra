"""Local lesson archive for teaching *style* only — never rules search / FAQ.

Records live under storage/player/lessons/archive/<gameId>/ and are never
scanned by ingest or LanceDB rebuilds.
"""

from __future__ import annotations

import json
import os
from html import escape
from pathlib import Path

from rag_engine.contract import LessonTurn
from rag_engine.storage_paths import assert_game_id, lesson_archive_dir

# Cap how much past teaching we inject into the next teach prompt.
_MAX_SNIPPETS = 3
_MAX_CHARS_PER_SNIPPET = 400
_MAX_TOTAL_CHARS = 1200


def append_turn(storage_dir: Path, game_id: str, turn: LessonTurn) -> None:
    """Append one turn as a JSONL line. Best-effort; never raises to the caller."""
    try:
        assert_game_id(game_id)
        directory = lesson_archive_dir(storage_dir, game_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "turns.jsonl"
        line = json.dumps(
            {
                "id": turn.id,
                "kind": turn.kind,
                "unitId": turn.unit_id,
                "question": turn.question,
                "text": turn.text,
                "groundedness": turn.groundedness,
            },
            ensure_ascii=False,
        )
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
            handle.flush()
            os.fsync(handle.fileno())
    except OSError, ValueError, TypeError:
        return


def load_style_exemplars(storage_dir: Path, game_id: str) -> str:
    """Recent unit/digression texts as escaped style snippets (empty if none)."""
    try:
        assert_game_id(game_id)
        path = lesson_archive_dir(storage_dir, game_id) / "turns.jsonl"
        if not path.is_file():
            return ""
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError, ValueError:
        return ""

    snippets: list[str] = []
    total = 0
    for raw in reversed(lines):
        if len(snippets) >= _MAX_SNIPPETS or total >= _MAX_TOTAL_CHARS:
            break
        if not raw.strip():
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        kind = payload.get("kind")
        text = payload.get("text")
        if kind not in {"unit", "digression"} or not isinstance(text, str):
            continue
        clipped = text.strip()[:_MAX_CHARS_PER_SNIPPET]
        if not clipped:
            continue
        snippets.append(escape(clipped))
        total += len(clipped)

    snippets.reverse()
    return "\n\n".join(snippets)
