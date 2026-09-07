from rag_engine.ingest.chunking import CHUNK_TARGET_CHARS
from rag_engine.retrieval.rerank import (
    RERANK_TEXT_CHARS,
    CrossEncoderReranker,
    as_probability,
    sigmoid,
)
from rag_engine.retrieval.types import RetrievedChunk


def test_scoring_window_covers_a_whole_passage() -> None:
    # A shorter window would rank a passage by its opening lines alone.
    assert RERANK_TEXT_CHARS >= CHUNK_TARGET_CHARS


def test_sigmoid_maps_zero_to_half() -> None:
    assert sigmoid(0.0) == 0.5


def test_sigmoid_is_monotonic_and_bounded() -> None:
    low = sigmoid(-4.0)
    high = sigmoid(4.0)
    assert 0.0 < low < 0.5
    assert 0.5 < high < 1.0
    assert sigmoid(-80.0) == 0.0 or sigmoid(-80.0) < 1e-15
    assert sigmoid(80.0) > 0.999


def test_as_probability_keeps_a_score_the_model_already_normalised() -> None:
    # The bug this guards: sigmoid(0.000016) is 0.5, so an irrelevant passage
    # scored the same as a coin flip and cleared every threshold.
    assert as_probability(0.000016) == 0.000016
    assert as_probability(0.98) == 0.98
    assert as_probability(0.0) == 0.0
    assert as_probability(1.0) == 1.0


def test_as_probability_converts_a_raw_logit() -> None:
    assert as_probability(-11.0) < 0.001
    assert as_probability(3.9) > 0.9


class _RecordingCrossEncoder:
    def __init__(self, score: float = 0.0) -> None:
        self.pairs: list[tuple[str, str]] = []
        self._score = score

    def predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        self.pairs = list(pairs)
        return [self._score for _ in pairs]


def _chunk(text: str = "hello", chunk_id: str = "a") -> RetrievedChunk:
    return RetrievedChunk(
        id=chunk_id,
        game_id="azul",
        document_kind="rulebook",
        doc_key="main",
        text=text,
    )


def test_cross_encoder_wrapper_passes_a_probability_through() -> None:
    reranker = CrossEncoderReranker(_RecordingCrossEncoder(score=0.02))
    assert reranker.score("q", [_chunk()]) == [0.02]


def test_cross_encoder_truncates_passage_text_for_scoring_only() -> None:
    recorder = _RecordingCrossEncoder()
    reranker = CrossEncoderReranker(recorder)
    full = "x" * (RERANK_TEXT_CHARS + 200)
    chunk = _chunk(text=full, chunk_id="long")
    reranker.score("how many tiles?", [chunk])
    assert recorder.pairs == [("how many tiles?", "x" * RERANK_TEXT_CHARS)]
    assert chunk.text == full
