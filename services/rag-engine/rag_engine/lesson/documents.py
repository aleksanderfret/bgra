"""Load non-transcript document chunks for the active game set."""

from __future__ import annotations

from pathlib import Path

from rag_engine.contract import DOCUMENT_AUTHORITY, DocumentKind
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pipeline import read_chunks_jsonl
from rag_engine.ingest.registry import load_games
from rag_engine.storage_paths import chunks_path

KIND_ORDER: tuple[DocumentKind, ...] = (
    *(kind for kind in reversed(DOCUMENT_AUTHORITY) if kind != "video_transcript"),
    "video_transcript",
)


def iter_document_chunks(storage_dir: Path, game_ids: list[str]) -> list[ChunkRecord]:
    """Rulebook / FAQ / errata / player-aid chunks in kind-then-doc order."""
    games = {game.game_id: game for game in load_games(storage_dir)}
    collected: list[ChunkRecord] = []
    for game_id in game_ids:
        game = games.get(game_id)
        if game is None:
            continue
        docs = sorted(
            game.documents,
            key=lambda document: (
                KIND_ORDER.index(document.document_kind)
                if document.document_kind in KIND_ORDER
                else 99,
                document.doc_key,
            ),
        )
        for document in docs:
            if document.document_kind == "video_transcript":
                continue
            path = chunks_path(storage_dir, game_id, document.document_kind, document.doc_key)
            collected.extend(read_chunks_jsonl(path))
    return collected
