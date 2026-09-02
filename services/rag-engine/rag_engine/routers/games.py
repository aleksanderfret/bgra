"""The set of games that have been ingested on this machine."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import TypeAdapter, ValidationError

from ..contract import GameSummary
from ..settings import Settings, get_settings

router = APIRouter(tags=["library"])

_GAMES_ADAPTER = TypeAdapter(list[GameSummary])


@router.get("/games")
async def list_games(
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[GameSummary]:
    """Lists indexed games, newest ingestion first.

    An empty list is the normal state of a fresh install, not an error: the
    registry file is written by the ingestion pipeline.
    """
    registry = settings.games_registry
    if not registry.is_file():
        return []

    try:
        payload = json.loads(registry.read_text(encoding="utf-8"))
        games = _GAMES_ADAPTER.validate_python(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        # A corrupt registry is worth reporting loudly: silently returning an
        # empty library would look like "no games ingested yet".
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Game registry at {registry} is unreadable: {error}",
        ) from error

    return sorted(games, key=lambda game: game.indexed_at or "", reverse=True)
