from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import __version__
from .routers import ask, games, health, ingest
from .settings import ensure_storage_writable, get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    ensure_storage_writable(settings.storage_dir)
    settings.assets_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="BGA rules engine",
        version=__version__,
        summary="Answers board game rules questions from locally indexed documents",
    )

    # No CORS: the browser only talks to Next.js, which proxies here.
    app.include_router(health.router)
    app.include_router(games.router)
    app.include_router(ingest.router)
    app.include_router(ask.router)

    app.mount(
        "/static/assets",
        StaticFiles(directory=settings.assets_dir),
        name="assets",
    )

    return app


app = create_app()
