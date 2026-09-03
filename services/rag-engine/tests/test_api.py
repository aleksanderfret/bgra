import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from rag_engine.contract import GameSummary
from rag_engine.engines.llm import OllamaUnreachableError
from rag_engine.main import create_app
from rag_engine.settings import Settings, get_settings

_ALL_TAGS = {"qwen3:14b", "bge-m3"}
_TAGS_PATCH = "rag_engine.routers.ask.installed_ollama_tags"
_GEN_PATCH = "rag_engine.routers.ask.generate_stream"
_HEALTH_TAGS_PATCH = "rag_engine.routers.health.installed_ollama_tags"


@pytest.fixture
def storage(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    return tmp_path


@pytest.fixture
def client(storage: Path) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        storage_dir=storage,
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


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
    for word in ["Hello", " world", "!"]:
        yield word


def _ask_body(
    game_id: str = "azul",
    question: str = "Kto zaczyna?",
    mode: str = "teach",
    expansion_ids: list[str] | None = None,
) -> dict[str, object]:
    body: dict[str, object] = {"gameId": game_id, "question": question, "mode": mode}
    if expansion_ids is not None:
        body["expansionIds"] = expansion_ids
    return body


def test_ask_rejects_invalid_expansion_ids(
    client: TestClient,
    storage: Path,
) -> None:
    (storage / "games.json").write_text(
        json.dumps(
            [
                {
                    "gameId": "azul",
                    "title": "Azul",
                    "chunkCount": 1,
                    "documentKinds": ["rulebook"],
                    "indexedAt": "2026-01-05T10:00:00Z",
                    "baseGameId": None,
                    "documents": [],
                },
            ]
        ),
        encoding="utf-8",
    )
    response = client.post(
        "/ask",
        json=_ask_body(expansion_ids=["not-an-expansion"]),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_expansion_ids"


def test_ask_accepts_validated_expansion_ids(
    client: TestClient,
    storage: Path,
) -> None:
    (storage / "games.json").write_text(
        json.dumps(
            [
                {
                    "gameId": "azul",
                    "title": "Azul",
                    "chunkCount": 1,
                    "documentKinds": ["rulebook"],
                    "indexedAt": "2026-01-05T10:00:00Z",
                    "baseGameId": None,
                    "documents": [],
                },
                {
                    "gameId": "azul-crystal",
                    "title": "Azul Crystal",
                    "chunkCount": 1,
                    "documentKinds": ["rulebook"],
                    "indexedAt": "2026-02-01T10:00:00Z",
                    "baseGameId": "azul",
                    "documents": [],
                },
            ]
        ),
        encoding="utf-8",
    )
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/ask", json=_ask_body(expansion_ids=["azul-crystal"])) as response,
    ):
        assert response.status_code == 200
        frames = _frames("".join(response.iter_text()))
    assert frames[-1]["type"] == "done"


# --- health ---


def test_health_reports_ok_when_all_models_installed(
    client: TestClient,
) -> None:
    with patch(_HEALTH_TAGS_PATCH, _mock_tags(_ALL_TAGS)):
        response = client.get("/health")

    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["missingModels"] == []


def test_health_reports_degraded_with_missing_model(
    client: TestClient,
) -> None:
    with patch(_HEALTH_TAGS_PATCH, _mock_tags({"bge-m3"})):
        response = client.get("/health")

    payload = response.json()
    assert payload["status"] == "degraded"
    assert "qwen3:14b" in payload["missingModels"]


def test_health_reports_degraded_when_ollama_unreachable(
    client: TestClient,
) -> None:
    with patch(
        _HEALTH_TAGS_PATCH,
        side_effect=OllamaUnreachableError("down"),
    ):
        response = client.get("/health")

    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["components"]["ollama"] is False


def test_health_names_the_loaded_models(client: TestClient) -> None:
    with patch(_HEALTH_TAGS_PATCH, _mock_tags(set())):
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert "ollama" in payload["components"]
    assert payload["models"]["llm"]


# --- games ---


def test_games_is_empty_before_any_ingestion(
    client: TestClient,
) -> None:
    response = client.get("/games")
    assert response.status_code == 200
    assert response.json() == []


def test_games_returns_the_registry_newest_first(
    client: TestClient,
    storage: Path,
) -> None:
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
    assert [g["gameId"] for g in payload] == ["brass", "azul"]
    assert payload[0]["documentKinds"] == ["rulebook", "faq"]


def test_corrupt_registry_is_reported_not_hidden(
    client: TestClient,
    storage: Path,
) -> None:
    (storage / "games.json").write_text(
        "{ this is not json",
        encoding="utf-8",
    )
    response = client.get("/games")
    assert response.status_code == 500
    assert "unreadable" in response.json()["detail"]


def test_registry_failure_does_not_reveal_the_filesystem(
    client: TestClient,
    storage: Path,
) -> None:
    (storage / "games.json").write_text(
        "{ this is not json",
        encoding="utf-8",
    )
    detail = client.get("/games").json()["detail"]
    assert str(storage) not in detail
    assert "games.json" not in detail


# --- ask: model available ---


def test_ask_streams_tokens_from_model(client: TestClient) -> None:
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/ask", json=_ask_body()) as response,
    ):
        assert response.status_code == 200
        events = _frames("".join(response.iter_text()))

    kinds = [e["type"] for e in events]
    assert "sources" in kinds
    assert "token" in kinds
    assert events[-1]["type"] == "done"
    assert events[-1]["groundedness"] == "partial"


def test_ask_sends_generating_status_between_sources_and_tokens(
    client: TestClient,
) -> None:
    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _fake_generate),
        client.stream("POST", "/ask", json=_ask_body()) as response,
    ):
        events = _frames("".join(response.iter_text()))

    kinds = [e["type"] for e in events]
    sources_idx = kinds.index("sources")
    gen_indices = [
        i for i, k in enumerate(kinds) if k == "status" and events[i].get("stage") == "generating"
    ]
    assert len(gen_indices) == 1
    assert gen_indices[0] > sources_idx
    token_indices = [i for i, k in enumerate(kinds) if k == "token"]
    assert all(ti > gen_indices[0] for ti in token_indices)


# --- ask: model not available ---


def test_ask_falls_back_when_ollama_unreachable(
    client: TestClient,
) -> None:
    with (
        patch(
            _TAGS_PATCH,
            side_effect=OllamaUnreachableError("down"),
        ),
        client.stream("POST", "/ask", json=_ask_body()) as response,
    ):
        events = _frames("".join(response.iter_text()))

    done = events[-1]
    assert done["groundedness"] == "insufficient_evidence"
    notices = [e for e in events if e["type"] == "notice"]
    assert notices[0]["code"] == "engine_not_indexed"


def test_ask_falls_back_when_model_missing(
    client: TestClient,
) -> None:
    with (
        patch(_TAGS_PATCH, _mock_tags({"bge-m3"})),
        client.stream("POST", "/ask", json=_ask_body()) as response,
    ):
        events = _frames("".join(response.iter_text()))

    done = events[-1]
    assert done["groundedness"] == "insufficient_evidence"


# --- ask: validation ---


def test_ask_rejects_a_question_without_a_game(
    client: TestClient,
) -> None:
    response = client.post("/ask", json=_ask_body(game_id=""))
    assert response.status_code == 422


@pytest.mark.parametrize(
    "game_id",
    ["../../etc/passwd", "azul/rulebook", "..", "Azul", "azul\x00"],
)
def test_ask_rejects_a_game_id_that_is_not_a_slug(
    client: TestClient,
    game_id: str,
) -> None:
    response = client.post("/ask", json=_ask_body(game_id=game_id))
    assert response.status_code == 422


# --- ask: mid-generation failure ---


def test_ask_returns_insufficient_evidence_on_generation_error(
    client: TestClient,
) -> None:
    async def _failing_generate(
        *_args: object,
        **_kwargs: object,
    ) -> AsyncIterator[str]:
        yield "partial answer"
        raise OllamaUnreachableError("connection lost")

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _failing_generate),
        client.stream("POST", "/ask", json=_ask_body()) as response,
    ):
        events = _frames("".join(response.iter_text()))

    tokens = [e for e in events if e["type"] == "token"]
    assert len(tokens) >= 1
    errors = [e for e in events if e["type"] == "error"]
    assert len(errors) == 1
    assert errors[0]["code"] == "engine_unreachable"
    done = events[-1]
    assert done["type"] == "done"
    assert done["groundedness"] == "insufficient_evidence"


# --- semaphore ---


def test_two_requests_do_not_generate_in_parallel(
    client: TestClient,
) -> None:
    call_log: list[tuple[str, float]] = []

    async def _slow_generate(
        *_args: object,
        **_kwargs: object,
    ) -> AsyncIterator[str]:
        call_log.append(("start", asyncio.get_event_loop().time()))
        await asyncio.sleep(0.15)
        yield "answer"
        call_log.append(("end", asyncio.get_event_loop().time()))

    with (
        patch(_TAGS_PATCH, _mock_tags(_ALL_TAGS)),
        patch(_GEN_PATCH, _slow_generate),
    ):
        import concurrent.futures

        def do_ask() -> list[dict[str, object]]:
            with client.stream(
                "POST",
                "/ask",
                json=_ask_body(question="Test?"),
            ) as resp:
                return _frames("".join(resp.iter_text()))

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            f1 = pool.submit(do_ask)
            f2 = pool.submit(do_ask)
            r1, r2 = f1.result(), f2.result()

    assert r1[-1]["type"] == "done"
    assert r2[-1]["type"] == "done"
    assert len(call_log) == 4
    starts = [t for label, t in call_log if label == "start"]
    ends = [t for label, t in call_log if label == "end"]
    assert starts[1] >= ends[0]


# --- ingest ---


def _tiny_pdf(path: Path) -> Path:
    import pymupdf

    doc = pymupdf.open()  # type: ignore[no-untyped-call,unused-ignore]
    page = doc.new_page()
    page.insert_text((72, 72), "# Setup\n\nDraw tiles.")
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)  # type: ignore[no-untyped-call,unused-ignore]
    doc.close()  # type: ignore[no-untyped-call,unused-ignore]
    return path


def test_ingest_pdf_upload_registers_the_game(client: TestClient, tmp_path: Path) -> None:
    pdf = _tiny_pdf(tmp_path / "demo.pdf")
    with pdf.open("rb") as handle:
        response = client.post(
            "/ingest/pdf",
            data={"gameId": "azul", "title": "Azul"},
            files={"file": ("demo.pdf", handle, "application/pdf")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["gameId"] == "azul"
    assert payload["chunkCount"] > 0
    assert "rulebook" in payload["documentKinds"]
    listed = client.get("/games").json()
    assert listed[0]["gameId"] == "azul"


def test_ingest_pdf_upload_rejects_a_bad_game_id(client: TestClient, tmp_path: Path) -> None:
    pdf = _tiny_pdf(tmp_path / "demo.pdf")
    with pdf.open("rb") as handle:
        response = client.post(
            "/ingest/pdf",
            data={"gameId": "Azul"},
            files={"file": ("demo.pdf", handle, "application/pdf")},
        )

    assert response.status_code == 400
    body = response.json()
    assert body["type"] == "error"
    assert body["code"] == "invalid_game_id"


def test_ingest_pdf_upload_rejects_non_pdf_bytes(client: TestClient) -> None:
    response = client.post(
        "/ingest/pdf",
        data={"gameId": "azul"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_file"


@pytest.mark.asyncio
async def test_ingest_pdf_upload_rejects_a_second_import_while_busy(
    storage: Path, tmp_path: Path
) -> None:
    import threading

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(storage_dir=storage)
    pdf_bytes = _tiny_pdf(tmp_path / "demo.pdf").read_bytes()
    started = threading.Event()
    release = threading.Event()

    def _slow_ingest(*_args: object, **_kwargs: object) -> GameSummary:
        started.set()
        if not release.wait(timeout=5):
            raise AssertionError("ingest lock test timed out")
        return GameSummary(
            game_id="azul",
            title="Azul",
            chunk_count=1,
            document_kinds=["rulebook"],
            base_game_id=None,
            documents=[],
        )

    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("rag_engine.routers.ingest.ingest_rulebook", _slow_ingest):
                first = asyncio.create_task(
                    client.post(
                        "/ingest/pdf",
                        data={"gameId": "azul", "title": "Azul"},
                        files={"file": ("demo.pdf", pdf_bytes, "application/pdf")},
                    )
                )
                assert await asyncio.to_thread(started.wait, 5)
                second = await client.post(
                    "/ingest/pdf",
                    data={"gameId": "brass", "title": "Brass"},
                    files={"file": ("demo.pdf", pdf_bytes, "application/pdf")},
                )
                assert second.status_code == 409
                assert second.json()["code"] == "ingest_busy"
                release.set()
                first_response = await first
                assert first_response.status_code == 200
                assert first_response.json()["gameId"] == "azul"
    finally:
        release.set()
        app.dependency_overrides.clear()
