"""Atomic read/merge/write for storage/games.json."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from pydantic import TypeAdapter, ValidationError

from rag_engine.contract import DocumentKind, GameDocumentSummary, GameSummary
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
    documents: list[GameDocumentSummary],
    base_game_id: str | None = None,
) -> GameSummary:
    games = load_games(storage_dir)
    indexed_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    kinds = sorted(set(document_kinds))
    existing = next((game for game in games if game.game_id == game_id), None)
    resolved_base = (
        base_game_id if base_game_id is not None else (existing.base_game_id if existing else None)
    )
    updated = GameSummary(
        game_id=game_id,
        title=title,
        chunk_count=chunk_count,
        document_kinds=kinds,
        indexed_at=indexed_at,
        base_game_id=resolved_base,
        documents=documents,
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
    base_game_id: str | None = None,
) -> GameSummary:
    from rag_engine.ingest.pipeline import (
        list_document_kinds,
        list_game_documents,
        migrate_legacy_flat_pages,
    )

    migrate_legacy_flat_pages(storage_dir, game_id)
    games = load_games(storage_dir)
    existing = next((game for game in games if game.game_id == game_id), None)
    resolved_title = title or (existing.title if existing else game_id)
    documents = list_game_documents(storage_dir, game_id)
    return upsert_game(
        storage_dir,
        game_id=game_id,
        title=resolved_title,
        chunk_count=sum(doc.chunk_count for doc in documents),
        document_kinds=list_document_kinds(storage_dir, game_id),
        documents=documents,
        base_game_id=base_game_id,
    )


def validate_expansion_ids(
    storage_dir: Path,
    game_id: str,
    expansion_ids: list[str],
) -> list[str]:
    """Return validated expansion ids or raise ValueError."""
    if not expansion_ids:
        return []
    games = {game.game_id: game for game in load_games(storage_dir)}
    if game_id not in games:
        raise ValueError(f"Unknown game id {game_id!r}.")
    validated: list[str] = []
    seen: set[str] = set()
    for expansion_id in expansion_ids:
        if expansion_id == game_id:
            raise ValueError("expansionIds must not include the base gameId.")
        if expansion_id in seen:
            continue
        seen.add(expansion_id)
        expansion = games.get(expansion_id)
        if expansion is None or expansion.base_game_id != game_id:
            raise ValueError(
                f"Expansion {expansion_id!r} is not registered under base {game_id!r}."
            )
        validated.append(expansion_id)
    return validated


def active_game_ids(game_id: str, expansion_ids: list[str]) -> list[str]:
    return [game_id, *expansion_ids]
