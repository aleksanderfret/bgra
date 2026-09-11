import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import TypeAdapter, ValidationError

from ..contract import GameCatalogueItem, GameSummary
from ..settings import Settings, get_settings

router = APIRouter(tags=["library"])

_GAMES_ADAPTER = TypeAdapter(list[GameSummary])
_logger = logging.getLogger(__name__)


def _load_registry(settings: Settings) -> list[GameSummary]:
    registry = settings.games_registry
    if not registry.is_file():
        return []

    try:
        payload = json.loads(registry.read_text(encoding="utf-8"))
        return _GAMES_ADAPTER.validate_python(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        _logger.exception("Game registry at %s is unreadable", registry)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The game registry is unreadable.",
        ) from error


@router.get("/games/catalogue")
async def list_games_catalogue(
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[GameCatalogueItem]:
    games = _load_registry(settings)
    return [
        GameCatalogueItem(game_id=game.game_id, title=game.title, base_game_id=game.base_game_id)
        for game in sorted(games, key=lambda game: game.indexed_at or "", reverse=True)
    ]


@router.get("/games")
async def list_games(
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[GameSummary]:
    games = _load_registry(settings)
    return sorted(games, key=lambda game: game.indexed_at or "", reverse=True)
