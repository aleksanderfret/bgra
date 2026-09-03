"""Atomic read/merge/write for storage/games.json."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from pydantic import TypeAdapter, ValidationError

from rag_engine.contract import DocumentKind, GameSummary
from rag_engine.storage_paths import games_registry_path

_ADAPTER = TypeAdapter(list[GameSummary])


def load_games(storage_dir: Path) -> list[GameSummary]:
    registry = games_registry_path(storage_dir)
    if not registry.is_file():
        return []
    try:
        payload = json.loads(registry.read_text(encoding="utf-8"))
        return _ADAPTER.validate_python(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        raise RuntimeError("The game registry is unreadable.") from error


def save_games(storage_dir: Path, games: list[GameSummary]) -> None:
    storage_dir.mkdir(parents=True, exist_ok=True)
    registry = games_registry_path(storage_dir)
    payload = [game.model_dump(by_alias=True) for game in games]
    tmp = registry.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, registry)


def upsert_game(
    storage_dir: Path,
    *,
    game_id: str,
    title: str,
    chunk_count: int,
    document_kinds: list[DocumentKind],
) -> GameSummary:
    games = load_games(storage_dir)
    indexed_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    kinds = sorted(set(document_kinds))
    updated = GameSummary(
        game_id=game_id,
        title=title,
        chunk_count=chunk_count,
        document_kinds=kinds,
        indexed_at=indexed_at,
    )
    others = [game for game in games if game.game_id != game_id]
    others.append(updated)
    save_games(storage_dir, others)
    return updated


def recount_game(
    storage_dir: Path,
    game_id: str,
    *,
    title: str | None = None,
) -> GameSummary:
    from rag_engine.ingest.pipeline import count_chunks_for_game, list_document_kinds

    games = load_games(storage_dir)
    existing = next((game for game in games if game.game_id == game_id), None)
    resolved_title = title or (existing.title if existing else game_id)
    return upsert_game(
        storage_dir,
        game_id=game_id,
        title=resolved_title,
        chunk_count=count_chunks_for_game(storage_dir, game_id),
        document_kinds=list_document_kinds(storage_dir, game_id),
    )
