"""FastAPI application for the local rules engine."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import __version__
from .routers import ask, games, health
from .settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    settings.assets_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="BGA rules engine",
        version=__version__,
        summary="Answers board game rules questions from locally indexed documents",
    )

    # No CORS middleware on purpose. The browser only ever talks to Next.js,
    # which proxies to this service at /api/engine/*, so every request is
    # same-origin and this port stays bound to localhost.
    app.include_router(health.router)
    app.include_router(games.router)
    app.include_router(ask.router)

    # Page renders and figure crops extracted from rulebooks.
    app.mount(
        "/static/assets",
        StaticFiles(directory=settings.assets_dir),
        name="assets",
    )

    return app


app = create_app()
