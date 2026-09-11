"""Serialize LanceDB index writes so warm catch-up, Ask, and PDF import do not collide.

Uses a re-entrant threading lock: background catch-up releases between games/docs so
an early Ask for one title can slip in without waiting on the whole library.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Sequence
from pathlib import Path

logger = logging.getLogger(__name__)

INDEX_WRITE_LOCK = threading.RLock()


async def ensure_games_search(storage_dir: Path, game_ids: Sequence[str]) -> None:
    """Catch up search for each game, releasing between titles for early Ask."""
    from rag_engine.ingest.pipeline import ensure_search_index

    for game_id in game_ids:
        try:
            await asyncio.to_thread(
                ensure_search_index,
                storage_dir,
                None,
                only_game_id=game_id,
            )
        except Exception:
            logger.exception("Per-game search catch-up failed for %s", game_id)
