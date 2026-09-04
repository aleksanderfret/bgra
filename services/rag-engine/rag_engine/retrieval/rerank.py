import math
from collections.abc import Sequence
from typing import Protocol

from rag_engine.retrieval.types import RetrievedChunk


def sigmoid(logit: float) -> float:
    if logit >= 0:
        return 1.0 / (1.0 + math.exp(-logit))
    exp = math.exp(logit)
    return exp / (1.0 + exp)


class PairScorer(Protocol):
    def predict(self, pairs: list[tuple[str, str]]) -> Sequence[float]: ...


class CrossEncoderReranker:
    def __init__(self, model: PairScorer) -> None:
        self._model = model

    def score(self, query: str, passages: list[RetrievedChunk]) -> list[float]:
        if not passages:
            return []
        pairs = [(query, chunk.text) for chunk in passages]
        raw = self._model.predict(pairs)
        return [sigmoid(float(value)) for value in raw]
