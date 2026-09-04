import pytest
from fastapi import FastAPI


@pytest.fixture(autouse=True)
def skip_search_index(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    if request.node.get_closest_marker("live_index"):
        return
    monkeypatch.setattr("rag_engine.ingest.pipeline.maybe_index_document", lambda *_a, **_k: None)


def _skip_retrieval_load(app: FastAPI, _reranker_id: str) -> None:
    app.state.retrieval_stack = None
    app.state.retrieval_loading = False


@pytest.fixture(autouse=True)
def skip_real_retrieval_stack(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch
) -> None:
    if request.node.get_closest_marker("live_retrieval"):
        return
    monkeypatch.setattr("rag_engine.main.schedule_retrieval_load", _skip_retrieval_load)
