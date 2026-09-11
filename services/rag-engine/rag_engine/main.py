import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import __version__
from .engines.embed import embed_texts
from .engines.llm import load_model
from .ingest.pipeline import (
    ensure_layout_ingest,
    ensure_search_index,
    ensure_section_maps,
    resplit_stored_chunks,
)
from .ingest.registry import load_games
from .mac_dock import hide_cli_from_macos_dock
from .retrieval.service import try_load
from .routers import ask, games, health, ingest, lesson, speech
from .settings import Settings, ensure_storage_writable, get_settings

logger = logging.getLogger(__name__)

# Before uvicorn binds: bare `python` otherwise gets a blinking Dock "exec" tile.
hide_cli_from_macos_dock()


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


async def _resize_oversized_chunks(settings: Settings) -> None:
    """Bring documents imported before the chunk size cap up to date.

    Runs while the app still reports retrieval as loading, so a question can
    never hit a document that is half re-indexed.
    """
    try:
        rewritten = await asyncio.to_thread(resplit_stored_chunks, settings.storage_dir)
    except Exception:
        logger.exception("Could not re-split oversized chunks; retrying on the next start.")
        return
    if rewritten:
        logger.info("Re-split %d document(s) into smaller passages.", rewritten)


async def _ensure_section_maps(settings: Settings) -> None:
    try:
        rewritten = await asyncio.to_thread(ensure_section_maps, settings.storage_dir)
    except Exception:
        logger.exception("Could not build section catalogues; retrying on the next start.")
        return
    if rewritten:
        logger.info("Built section catalogues for %d document(s).", rewritten)


async def _ensure_layout_ingest(app: FastAPI, settings: Settings) -> None:
    app.state.layout_ingest = True
    try:
        rewritten = await asyncio.to_thread(ensure_layout_ingest, settings.storage_dir)
    except Exception:
        logger.exception("Could not re-read PDF page layout; retrying on the next start.")
        return
    finally:
        app.state.layout_ingest = False
    if rewritten:
        logger.info("Re-read page layout for %d document(s).", rewritten)


def _is_current_generation(app: FastAPI, generation: int) -> bool:
    return int(getattr(app.state, "retrieval_load_generation", 0)) == generation


async def _warm_retrieval(app: FastAPI, reranker_id: str, generation: int) -> None:
    settings = get_settings()
    try:
        if _is_current_generation(app, generation):
            app.state.warm_stage = "starting_assistant"
        # Yield so /health can observe starting_assistant before the pin stage.
        await asyncio.sleep(0)

        if _is_current_generation(app, generation):
            app.state.warm_stage = "teaching_answers"
        await _pin_ollama_weights(settings)

        if not _is_current_generation(app, generation):
            return

        app.state.warm_stage = "finding_rules"
        try:
            stack = await asyncio.to_thread(try_load, reranker_id)
        except Exception:
            logger.exception("Failed to load the retrieval stack.")
            if _is_current_generation(app, generation):
                app.state.retrieval_stack = None
            return

        if stack is not None:
            await _resize_oversized_chunks(settings)
            await _ensure_section_maps(settings)

        if not _is_current_generation(app, generation):
            return

        if stack is None:
            app.state.retrieval_stack = None
            app.state.retrieval_loading = False
            app.state.warm_stage = None
            return

        # Catch-up flag before Ask-ready so early Ask always runs per-game ensure.
        app.state.library_catch_up = True
        app.state.retrieval_stack = stack
        app.state.retrieval_loading = False
        app.state.warm_stage = None

        try:
            if not _is_current_generation(app, generation):
                return
            await _ensure_layout_ingest(app, settings)
            if not _is_current_generation(app, generation):
                return
            games = await asyncio.to_thread(load_games, settings.storage_dir)
            for game in games:
                if not _is_current_generation(app, generation):
                    return
                try:
                    await asyncio.to_thread(
                        ensure_search_index,
                        settings.storage_dir,
                        None,
                        only_game_id=game.game_id,
                    )
                except Exception:
                    logger.exception(
                        "Could not catch up search for %s; continuing with the library.",
                        game.game_id,
                    )
        finally:
            if _is_current_generation(app, generation):
                app.state.library_catch_up = False
    finally:
        if _is_current_generation(app, generation):
            app.state.retrieval_loading = False
            app.state.warm_stage = None


def schedule_retrieval_load(app: FastAPI, reranker_id: str) -> asyncio.Task[None] | None:
    previous = getattr(app.state, "retrieval_load_task", None)
    if previous is not None and not previous.done():
        previous.cancel()

    generation = int(getattr(app.state, "retrieval_load_generation", 0)) + 1
    app.state.retrieval_load_generation = generation
    app.state.retrieval_stack = None
    app.state.retrieval_loading = True
    app.state.layout_ingest = False
    app.state.library_catch_up = False
    app.state.warm_stage = "starting_assistant"
    task = asyncio.get_running_loop().create_task(_warm_retrieval(app, reranker_id, generation))
    app.state.retrieval_load_task = task
    return task


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    import os

    settings = get_settings()
    app.state.library_catch_up = False
    app.state.warm_stage = None
    # Packaged first-run (Stage 3B) skips warm until models exist; reload always works.
    if os.environ.get("BGA_SKIP_RETRIEVAL_WARM") == "1":
        app.state.retrieval_stack = None
        app.state.retrieval_loading = False
        app.state.layout_ingest = False
        logger.info("Skipping retrieval warm-up (BGA_SKIP_RETRIEVAL_WARM=1).")
    else:
        # Serve /health and /games immediately; CrossEncoder load can take minutes.
        schedule_retrieval_load(app, settings.profile.reranker)
    try:
        yield
    finally:
        task = getattr(app.state, "retrieval_load_task", None)
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
    app.include_router(lesson.router)
    app.include_router(speech.router)

    app.mount(
        "/static/assets",
        StaticFiles(directory=settings.assets_dir),
        name="assets",
    )

    return app


app = create_app()
