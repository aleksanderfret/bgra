from rag_engine.retrieval.rerank import sigmoid


def test_sigmoid_maps_zero_to_half() -> None:
    assert sigmoid(0.0) == 0.5


def test_sigmoid_is_monotonic_and_bounded() -> None:
    low = sigmoid(-4.0)
    high = sigmoid(4.0)
    assert 0.0 < low < 0.5
    assert 0.5 < high < 1.0
    assert sigmoid(-80.0) == 0.0 or sigmoid(-80.0) < 1e-15
    assert sigmoid(80.0) > 0.999


class _StubCrossEncoder:
    def predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        return [0.0 for _ in pairs]


def test_cross_encoder_wrapper_applies_sigmoid() -> None:
    from rag_engine.retrieval.rerank import CrossEncoderReranker
    from rag_engine.retrieval.types import RetrievedChunk

    reranker = CrossEncoderReranker(_StubCrossEncoder())
    chunk = RetrievedChunk(
        id="a",
        game_id="azul",
        document_kind="rulebook",
        doc_key="main",
        text="hello",
    )
    assert reranker.score("q", [chunk]) == [0.5]
