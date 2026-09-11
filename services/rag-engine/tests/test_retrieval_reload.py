"""Retrieval reload and generation-safe warm-up (Stage 3F)."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from rag_engine.main import _warm_retrieval, create_app, schedule_retrieval_load
from rag_engine.settings import Settings, get_settings


@pytest.fixture
def storage(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    return tmp_path


@pytest.fixture
def app(storage: Path) -> Iterator[FastAPI]:
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: Settings(storage_dir=storage)
    yield application
    application.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_reload_is_noop_while_loading(app: FastAPI, client: TestClient) -> None:
    app.state.retrieval_loading = True
    app.state.retrieval_stack = None

    response = client.post("/retrieval/reload")

    assert response.status_code == 200
    assert response.json() == {"started": False}


def test_reload_is_noop_when_stack_already_ready(app: FastAPI, client: TestClient) -> None:
    app.state.retrieval_loading = False
    app.state.retrieval_stack = object()

    response = client.post("/retrieval/reload")

    assert response.status_code == 200
    assert response.json() == {"started": False}


def test_lifespan_skips_warm_when_env_set(storage: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BGA_SKIP_RETRIEVAL_WARM", "1")
    scheduled: list[str] = []

    def fake_schedule(target: FastAPI, reranker_id: str) -> None:
        scheduled.append(reranker_id)
        return None

    monkeypatch.setattr("rag_engine.main.schedule_retrieval_load", fake_schedule)
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: Settings(storage_dir=storage)
    with TestClient(application):
        assert scheduled == []
        assert application.state.retrieval_stack is None
        assert application.state.retrieval_loading is False
    application.dependency_overrides.clear()


def test_reload_starts_when_search_failed(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.state.retrieval_loading = False
    app.state.retrieval_stack = None

    def fake_schedule(target: FastAPI, _reranker_id: str) -> None:
        target.state.retrieval_stack = None
        target.state.retrieval_loading = True
        return None

    monkeypatch.setattr("rag_engine.main.schedule_retrieval_load", fake_schedule)

    response = client.post("/retrieval/reload")

    assert response.status_code == 200
    assert response.json() == {"started": True}
    assert app.state.retrieval_loading is True


@pytest.mark.asyncio
async def test_stale_warm_finally_does_not_clear_newer_loading(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = FastAPI()
    application.state.retrieval_load_generation = 1
    application.state.retrieval_loading = True
    application.state.retrieval_stack = None

    thread_gate = threading.Event()

    def slow_try_load(_reranker_id: str) -> None:
        thread_gate.wait(timeout=5)
        return None

    monkeypatch.setattr("rag_engine.main.try_load", slow_try_load)
    monkeypatch.setattr(
        "rag_engine.main.get_settings",
        lambda: Settings(storage_dir=Path("/tmp/bga-test-unused")),
    )

    task = asyncio.create_task(_warm_retrieval(application, "reranker-id", generation=1))
    await asyncio.sleep(0.05)
    application.state.retrieval_load_generation = 2
    application.state.retrieval_loading = True
    thread_gate.set()
    await task

    assert application.state.retrieval_loading is True


@pytest.mark.asyncio
async def test_schedule_bumps_generation_and_sets_loading(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = FastAPI()
    application.state.retrieval_load_generation = 0

    async def immediate_to_thread(fn: object, *args: object) -> object:
        assert callable(fn)
        return fn(*args)

    monkeypatch.setattr("rag_engine.main.try_load", lambda _id: None)
    monkeypatch.setattr(
        "rag_engine.main.get_settings",
        lambda: Settings(storage_dir=Path("/tmp/bga-test-unused")),
    )
    monkeypatch.setattr("rag_engine.main.asyncio.to_thread", immediate_to_thread)

    task = schedule_retrieval_load(application, "reranker-id")
    assert task is not None
    await task

    assert application.state.retrieval_load_generation == 1
    assert application.state.retrieval_loading is False
    assert application.state.retrieval_stack is None


@pytest.mark.asyncio
async def test_warm_unlocks_ask_before_library_catch_up_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = FastAPI()
    application.state.retrieval_load_generation = 1
    application.state.retrieval_loading = True
    application.state.retrieval_stack = None
    application.state.library_catch_up = False

    stack = object()
    catch_up_started = asyncio.Event()
    allow_catch_up_finish = asyncio.Event()

    async def slow_layout(_app: FastAPI, _settings: Settings) -> None:
        catch_up_started.set()
        await allow_catch_up_finish.wait()

    async def pin(_settings: Settings) -> None:
        return None

    monkeypatch.setattr("rag_engine.main.try_load", lambda _id: stack)
    monkeypatch.setattr("rag_engine.main._pin_ollama_weights", pin)
    monkeypatch.setattr("rag_engine.main._resize_oversized_chunks", pin)
    monkeypatch.setattr("rag_engine.main._ensure_section_maps", pin)
    monkeypatch.setattr("rag_engine.main._ensure_layout_ingest", slow_layout)
    monkeypatch.setattr(
        "rag_engine.main.get_settings",
        lambda: Settings(storage_dir=Path("/tmp/bga-test-unused")),
    )

    task = asyncio.create_task(_warm_retrieval(application, "reranker-id", generation=1))
    await asyncio.wait_for(catch_up_started.wait(), timeout=2)
    assert application.state.retrieval_loading is False
    assert application.state.retrieval_stack is stack
    assert application.state.library_catch_up is True
    allow_catch_up_finish.set()
    await task
    assert application.state.library_catch_up is False


@pytest.mark.asyncio
async def test_background_search_catch_up_runs_one_game_at_a_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = FastAPI()
    application.state.retrieval_load_generation = 1
    application.state.retrieval_loading = True

    class _Game:
        def __init__(self, game_id: str) -> None:
            self.game_id = game_id

    calls: list[str] = []
    hold = threading.Event()
    first_entered = threading.Event()

    def fake_ensure(
        _storage: Path,
        _progress: object = None,
        *,
        only_game_id: str | None = None,
    ) -> int:
        assert only_game_id is not None
        calls.append(only_game_id)
        if only_game_id == "a":
            first_entered.set()
            hold.wait(timeout=2)
        return 0

    async def noop(_settings: Settings) -> None:
        return None

    async def noop_layout(_app: FastAPI, _settings: Settings) -> None:
        return None

    monkeypatch.setattr("rag_engine.main.try_load", lambda _id: object())
    monkeypatch.setattr("rag_engine.main._pin_ollama_weights", noop)
    monkeypatch.setattr("rag_engine.main._resize_oversized_chunks", noop)
    monkeypatch.setattr("rag_engine.main._ensure_section_maps", noop)
    monkeypatch.setattr("rag_engine.main._ensure_layout_ingest", noop_layout)
    monkeypatch.setattr("rag_engine.main.load_games", lambda _storage: [_Game("a"), _Game("b")])
    monkeypatch.setattr("rag_engine.main.ensure_search_index", fake_ensure)
    monkeypatch.setattr(
        "rag_engine.main.get_settings",
        lambda: Settings(storage_dir=Path("/tmp/bga-test-unused")),
    )

    task = asyncio.create_task(_warm_retrieval(application, "reranker-id", generation=1))
    await asyncio.to_thread(first_entered.wait, 2)
    assert application.state.library_catch_up is True
    assert calls == ["a"]
    hold.set()
    await task
    assert calls == ["a", "b"]
    assert application.state.library_catch_up is False


def test_index_write_lock_is_reentrant() -> None:
    from rag_engine.catch_up import INDEX_WRITE_LOCK

    with INDEX_WRITE_LOCK, INDEX_WRITE_LOCK:
        assert INDEX_WRITE_LOCK.acquire(blocking=False)
        INDEX_WRITE_LOCK.release()


@pytest.mark.asyncio
async def test_layout_ingest_flag_is_on_only_while_re_reading(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rag_engine.main import _ensure_layout_ingest

    application = FastAPI()
    application.state.layout_ingest = False
    seen: list[bool] = []

    def _record(_storage: Path) -> int:
        seen.append(bool(application.state.layout_ingest))
        return 1

    monkeypatch.setattr("rag_engine.main.ensure_layout_ingest", _record)
    await _ensure_layout_ingest(application, Settings())
    assert seen == [True]
    assert application.state.layout_ingest is False
