import json
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from rag_engine.contract import GameDocumentSummary, GameSummary
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.pipeline import write_chunks_jsonl
from rag_engine.ingest.registry import save_games
from rag_engine.main import create_app
from rag_engine.settings import Settings, get_settings
from rag_engine.storage_paths import chunks_path, document_dir

_CHAT_TAG = Settings().profile.llm
_ALL_TAGS = {_CHAT_TAG, "bge-m3"}
_TAGS_PATCH = "rag_engine.routers.lesson.installed_ollama_tags"
_GEN_PATCH = "rag_engine.routers.lesson.generate_stream"
_LOAD_PATCH = "rag_engine.routers.lesson.load_model"


@pytest.fixture
def storage(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    return tmp_path


@pytest.fixture
def client(storage: Path) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(storage_dir=storage)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _chat_model_already_warm() -> Iterator[AsyncMock]:
    with patch(_LOAD_PATCH, new_callable=AsyncMock) as load:
        yield load


def _frames(raw: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for frame in raw.split("\n\n"):
        for line in frame.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line.removeprefix("data: ")))
    return events


def _mock_tags(tags: set[str]) -> AsyncMock:
    return AsyncMock(return_value=tags)


async def _fake_generate(
    *_args: object,
    **_kwargs: object,
) -> AsyncIterator[str]:
    for word in ["Hello", " world"]:
        yield word


def _seed_rulebook(storage: Path, *, game_id: str = "demo") -> None:
    game = GameSummary(
        game_id=game_id,
        title="Demo",
        chunk_count=2,
        document_kinds=["rulebook"],
        indexed_at="2026-01-01T00:00:00Z",
        base_game_id=None,
        documents=[
            GameDocumentSummary(
                doc_key="main",
                document_kind="rulebook",
                title="Rulebook",
                chunk_count=2,
                indexed_at="2026-01-01T00:00:00Z",
            )
        ],
    )
    save_games(storage, [game])
    document_dir(storage, game_id, "rulebook", "main").mkdir(parents=True, exist_ok=True)
    write_chunks_jsonl(
        chunks_path(storage, game_id, "rulebook", "main"),
        [
            ChunkRecord(
                id=f"{game_id}:rulebook:main:p01:c00",
                game_id=game_id,
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                page=1,
                text="Setup the board in the centre of the table.",
                heading="Setup",
                section_id="setup",
                block_kind="rule",
            ),
            ChunkRecord(
                id=f"{game_id}:rulebook:main:p03:c00",
                game_id=game_id,
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                page=3,
                text="On your turn take one action.",
                heading="Actions",
                section_id="actions",
                block_kind="rule",
            ),
        ],
    )


def test_lesson_start_streams_sources_and_tokens(
    client: TestClient,
    storage: Path,
) -> None:
    _seed_rulebook(storage)
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/lesson/start", json={"gameId": "demo"}) as response,
    ):
        assert response.status_code == 200
        frames = _frames("".join(response.iter_text()))

    types = [event["type"] for event in frames]
    assert "status" in types
    assert frames[0]["type"] == "status"
    assert frames[0]["stage"] == "planning"
    assert "sources" in types
    assert "token" in types
    assert "done" in types
    sources = next(event for event in frames if event["type"] == "sources")["sources"]
    assert isinstance(sources, list)
    assert len(sources) >= 1


def test_lesson_start_plan_failed_when_empty(
    client: TestClient,
    storage: Path,
) -> None:
    save_games(storage, [])
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/lesson/start", json={"gameId": "demo"}) as response,
    ):
        assert response.status_code == 200
        frames = _frames("".join(response.iter_text()))

    notices = [event for event in frames if event["type"] == "notice"]
    assert any(event.get("code") == "lesson_plan_failed" for event in notices)
    done = next(event for event in frames if event["type"] == "done")
    assert done["groundedness"] == "insufficient_evidence"


def test_lesson_continue_advances_and_ask_keeps_unit_index(
    client: TestClient,
    storage: Path,
) -> None:
    _seed_rulebook(storage)
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/lesson/start", json={"gameId": "demo"}) as response,
    ):
        assert response.status_code == 200
        _frames("".join(response.iter_text()))

    active = client.get("/lesson/active", params={"gameId": "demo"})
    assert active.status_code == 200
    session = active.json()["session"]
    assert session is not None
    session_id = session["sessionId"]
    assert session["unitIndex"] == 0
    assert len(session["syllabus"]) >= 2

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/lesson/continue", json={"sessionId": session_id}) as response,
    ):
        assert response.status_code == 200
        frames = _frames("".join(response.iter_text()))
    assert any(event["type"] == "token" for event in frames)

    after_continue = client.get("/lesson/active", params={"gameId": "demo"}).json()["session"]
    assert after_continue["unitIndex"] == 1
    unit_before_ask = after_continue["unitIndex"]

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        patch("rag_engine.routers.lesson.retrieve", new_callable=AsyncMock) as retrieve_mock,
    ):
        from rag_engine.retrieval.types import RetrievedChunk

        retrieve_mock.return_value = [
            RetrievedChunk(
                id="demo:rulebook:main:p03:c00",
                game_id="demo",
                document_kind="rulebook",
                doc_key="main",
                document_title="Rulebook",
                page=3,
                text="On your turn take one action.",
                heading="Actions",
                indexed_at="",
                score=0.9,
            )
        ]
        # Digression needs a retrieval stack for index.count_for_games
        from fastapi import FastAPI

        from rag_engine.retrieval.memory import MemoryIndex
        from rag_engine.retrieval.service import RetrievalStack

        class _AlwaysRelevant:
            def score(self, _query: str, passages: list[RetrievedChunk]) -> list[float]:
                return [0.9 for _ in passages]

        index = MemoryIndex()
        index.upsert(retrieve_mock.return_value)
        app = client.app
        assert isinstance(app, FastAPI)
        app.state.retrieval_stack = RetrievalStack(
            reranker=_AlwaysRelevant(),
            open_index=lambda _storage: index,
        )

        with client.stream(
            "POST",
            "/lesson/ask",
            json={"sessionId": session_id, "question": "How many actions?"},
        ) as response:
            assert response.status_code == 200
            ask_frames = _frames("".join(response.iter_text()))

    assert any(event["type"] == "token" for event in ask_frames)
    after_ask = client.get("/lesson/active", params={"gameId": "demo"}).json()["session"]
    assert after_ask["unitIndex"] == unit_before_ask
    kinds = [turn["kind"] for turn in after_ask["turns"]]
    assert "digression" in kinds


def test_lesson_active_returns_null_without_session(
    client: TestClient,
    storage: Path,
) -> None:
    save_games(storage, [])
    response = client.get("/lesson/active", params={"gameId": "demo"})
    assert response.status_code == 200
    assert response.json() == {"session": None}


def test_lesson_continue_reteaches_missing_first_unit(
    client: TestClient,
    storage: Path,
) -> None:
    """Abort after plan left unit_index=0 with no unit turn — Continuie retries unit 0."""
    from rag_engine.lesson.session_store import create_session, save_session
    from rag_engine.lesson.syllabus import build_syllabus

    _seed_rulebook(storage)
    session = create_session(storage, "demo", [])
    syllabus = build_syllabus(storage, ["demo"])
    assert len(syllabus) >= 2
    session = session.model_copy(
        update={
            "status": "active",
            "syllabus": syllabus,
            "unit_index": 0,
            "turns": [],
        }
    )
    save_session(storage, session)

    active = client.get("/lesson/active", params={"gameId": "demo"})
    assert active.status_code == 200
    assert active.json()["session"]["sessionId"] == session.session_id

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream(
            "POST",
            "/lesson/continue",
            json={"sessionId": session.session_id},
        ) as response,
    ):
        assert response.status_code == 200
        frames = _frames("".join(response.iter_text()))
    assert any(event["type"] == "token" for event in frames)

    after = client.get("/lesson/active", params={"gameId": "demo"}).json()["session"]
    assert after["unitIndex"] == 0
    unit_turns = [turn for turn in after["turns"] if turn["kind"] == "unit"]
    assert len(unit_turns) == 1
    assert unit_turns[0]["unitId"] == syllabus[0].unit_id

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream(
            "POST",
            "/lesson/continue",
            json={"sessionId": session.session_id},
        ) as response,
    ):
        assert response.status_code == 200
        _frames("".join(response.iter_text()))

    after_second = client.get("/lesson/active", params={"gameId": "demo"}).json()["session"]
    assert after_second["unitIndex"] == 1
