import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rag_engine.main import create_app
from rag_engine.settings import Settings, get_settings


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


def _frames(raw: str) -> list[dict[str, object]]:
    """Decodes an SSE body into the events it carried."""
    events: list[dict[str, object]] = []
    for frame in raw.split("\n\n"):
        for line in frame.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line.removeprefix("data: ")))
    return events


def test_health_names_the_loaded_models(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    # Degraded is expected on a machine where Ollama is not running; what
    # matters is that the report says which component is down.
    assert payload["status"] in {"ok", "degraded"}
    assert "ollama" in payload["components"]
    assert payload["models"]["llm"]


def test_games_is_empty_before_any_ingestion(client: TestClient) -> None:
    response = client.get("/games")

    assert response.status_code == 200
    assert response.json() == []


def test_games_returns_the_registry_newest_first(client: TestClient, storage: Path) -> None:
    (storage / "games.json").write_text(
        json.dumps(
            [
                {
                    "gameId": "azul",
                    "title": "Azul",
                    "chunkCount": 120,
                    "documentKinds": ["rulebook"],
                    "indexedAt": "2026-01-05T10:00:00Z",
                },
                {
                    "gameId": "brass",
                    "title": "Brass: Birmingham",
                    "chunkCount": 340,
                    "documentKinds": ["rulebook", "faq"],
                    "indexedAt": "2026-03-01T10:00:00Z",
                },
            ]
        ),
        encoding="utf-8",
    )

    payload = client.get("/games").json()

    assert [game["gameId"] for game in payload] == ["brass", "azul"]
    assert payload[0]["documentKinds"] == ["rulebook", "faq"]


def test_corrupt_registry_is_reported_not_hidden(client: TestClient, storage: Path) -> None:
    (storage / "games.json").write_text("{ this is not json", encoding="utf-8")

    response = client.get("/games")

    assert response.status_code == 500
    assert "unreadable" in response.json()["detail"]


def test_ask_streams_sources_before_the_answer(client: TestClient) -> None:
    with client.stream(
        "POST",
        "/ask",
        json={"gameId": "azul", "question": "Ile kafelków dobieram?", "mode": "arbitrate"},
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = _frames("".join(response.iter_text()))

    kinds = [event["type"] for event in events]

    # The frontend may only display evidence it was given, so the sources
    # frame has to arrive before the answer starts.
    assert kinds.index("sources") < kinds.index("notice")
    assert kinds[-1] == "done"


def test_ask_admits_it_has_no_evidence_yet(client: TestClient) -> None:
    with client.stream(
        "POST",
        "/ask",
        json={"gameId": "azul", "question": "Kto zaczyna?", "mode": "teach"},
    ) as response:
        events = _frames("".join(response.iter_text()))

    done = events[-1]
    assert done["groundedness"] == "insufficient_evidence"


def test_ask_reports_the_empty_index_as_a_code_not_as_prose(client: TestClient) -> None:
    # Wording belongs to the frontend, which has both languages; the engine
    # only names the situation and supplies the values to fill in.
    with client.stream(
        "POST",
        "/ask",
        json={"gameId": "azul", "question": "Kto zaczyna?", "mode": "teach"},
    ) as response:
        events = _frames("".join(response.iter_text()))

    notice = next(event for event in events if event["type"] == "notice")
    params = notice["params"]

    assert notice["code"] == "engine_not_indexed"
    assert isinstance(params, dict)
    assert params["gameId"] == "azul"
    assert params["profile"]


def test_ask_rejects_a_question_without_a_game(client: TestClient) -> None:
    # Unscoped retrieval would mix rules from every game in the library.
    response = client.post("/ask", json={"gameId": "", "question": "Kto zaczyna?"})

    assert response.status_code == 422
