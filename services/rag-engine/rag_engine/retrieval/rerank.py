import math
from collections.abc import Sequence
from typing import Protocol

from rag_engine.retrieval.types import RetrievedChunk

# Cross-encoder cost grows with passage length, so this is a ceiling, not a
# target. It covers a whole `CHUNK_TARGET_CHARS` passage: scoring a prefix of a
# long section hides any rule printed below that prefix.
RERANK_TEXT_CHARS = 1024


def sigmoid(logit: float) -> float:
    if logit >= 0:
        return 1.0 / (1.0 + math.exp(-logit))
    exp = math.exp(logit)
    return exp / (1.0 + exp)


class PairScorer(Protocol):
    def predict(self, pairs: list[tuple[str, str]]) -> Sequence[float]: ...


def as_probability(value: float) -> float:
    """Normalise one pair score to 0..1 whichever scale the scorer used.

    `CrossEncoder.predict` applies the model's own default activation, which is
    Sigmoid for `bge-reranker-v2-m3` — its output is already a probability, and
    passing it through `sigmoid` again squeezed every score into 0.5..0.73. That
    put all of them above `min_relevance_score`, so no passage was ever rejected
    and `insufficient_evidence` could not happen. A reranker configured without
    an activation returns logits instead, which do still need converting.
    """
    return value if 0.0 <= value <= 1.0 else sigmoid(value)


class CrossEncoderReranker:
    def __init__(self, model: PairScorer) -> None:
        self._model = model

    def score(self, query: str, passages: list[RetrievedChunk]) -> list[float]:
        if not passages:
            return []
        pairs = [(query, chunk.text[:RERANK_TEXT_CHARS]) for chunk in passages]
        raw = self._model.predict(pairs)
        return [as_probability(float(value)) for value in raw]
