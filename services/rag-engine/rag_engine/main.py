import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import __version__
from .engines.embed import embed_texts
from .engines.llm import load_model
from .retrieval.service import try_load
from .routers import ask, games, health, ingest
from .settings import Settings, ensure_storage_writable, get_settings

logger = logging.getLogger(__name__)


async def _pin_ollama_weights(settings: Settings) -> None:
    try:
        await embed_texts(settings.ollama_url, settings.profile.embedding, ["."])
        await load_model(
            settings.ollama_url,
            settings.profile.llm,
            context_tokens=settings.profile.context_tokens,
        )
    except Exception:
        logger.exception("Could not pin Ollama models; the first question may be slow.")


async def _warm_retrieval(app: FastAPI, reranker_id: str) -> None:
    settings = get_settings()
    try:
        try:
            stack = await asyncio.to_thread(try_load, reranker_id)
        except Exception:
            logger.exception("Failed to load the retrieval stack.")
            app.state.retrieval_stack = None
            return
        app.state.retrieval_stack = stack
        if stack is not None:
            await _pin_ollama_weights(settings)
    finally:
        app.state.retrieval_loading = False


def schedule_retrieval_load(app: FastAPI, reranker_id: str) -> asyncio.Task[None] | None:
    app.state.retrieval_stack = None
    app.state.retrieval_loading = True
    return asyncio.get_running_loop().create_task(_warm_retrieval(app, reranker_id))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # Serve /health and /games immediately; CrossEncoder load can take minutes.
    task = schedule_retrieval_load(app, settings.profile.reranker)
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def create_app() -> FastAPI:
    settings = get_settings()
    ensure_storage_writable(settings.storage_dir)
    settings.assets_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="BGA rules engine",
        version=__version__,
        summary="Answers board game rules questions from locally indexed documents",
        lifespan=lifespan,
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
