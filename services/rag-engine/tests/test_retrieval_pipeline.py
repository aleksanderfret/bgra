from dataclasses import dataclass, field

from rag_engine.retrieval.pipeline import retrieve
from rag_engine.retrieval.types import RetrievedChunk

_AZUL = RetrievedChunk(
    id="azul:rulebook:main:p03:c00",
    game_id="azul",
    document_kind="rulebook",
    doc_key="main",
    document_title="Azul",
    page=3,
    text="Draw four tiles.",
    heading="Setup",
    image_url="/static/assets/azul/documents/rulebook/main/p03.png",
    indexed_at="2026-01-01T00:00:00Z",
    score=0.0,
)

_BRASS = RetrievedChunk(
    id="brass:rulebook:main:p01:c00",
    game_id="brass",
    document_kind="rulebook",
    doc_key="main",
    document_title="Brass",
    page=1,
    text="Flip a canal tile.",
    heading="Canal",
    image_url=None,
    indexed_at="2026-01-01T00:00:00Z",
    score=0.0,
)

_EXPANSION = RetrievedChunk(
    id="azul-crystal:rulebook:main:p01:c00",
    game_id="azul-crystal",
    document_kind="rulebook",
    doc_key="main",
    document_title="Crystal Mosaic",
    page=1,
    text="Place a crystal overlay.",
    heading="Setup",
    image_url=None,
    indexed_at="2026-02-01T00:00:00Z",
    score=0.0,
)


@dataclass
class FakeIndex:
    vector_hits: list[RetrievedChunk]
    text_hits: list[RetrievedChunk]
    deleted: list[tuple[str, str, str]] = field(default_factory=list)

    def search_vector(
        self,
        _vector: list[float],
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        return [hit for hit in self.vector_hits if hit.game_id in game_ids][:limit]

    def search_text(
        self,
        _query: str,
        game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        return [hit for hit in self.text_hits if hit.game_id in game_ids][:limit]

    def count_for_games(self, game_ids: list[str]) -> int:
        ids = {hit.id for hit in [*self.vector_hits, *self.text_hits] if hit.game_id in game_ids}
        return len(ids)

    def delete_document(self, game_id: str, kind: str, doc_key: str) -> None:
        self.deleted.append((game_id, kind, doc_key))

    def upsert(self, chunks: list[RetrievedChunk]) -> None:
        self.vector_hits.extend(chunks)


@dataclass
class LeakyIndex(FakeIndex):
    """Ignores the game filter — the pipeline must still drop other games."""

    def search_vector(
        self,
        _vector: list[float],
        _game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        return self.vector_hits[:limit]

    def search_text(
        self,
        _query: str,
        _game_ids: list[str],
        limit: int,
    ) -> list[RetrievedChunk]:
        return self.text_hits[:limit]


class FakeEmbedder:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(len(text)), 0.0] for text in texts]


class FakeReranker:
    def __init__(self, scores: dict[str, float]) -> None:
        self.scores = scores

    def score(self, _query: str, passages: list[RetrievedChunk]) -> list[float]:
        return [self.scores.get(chunk.id, 0.0) for chunk in passages]


async def test_retrieve_drops_other_games_even_if_index_leaks() -> None:
    hits = await retrieve(
        question="Ile kafelków?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=LeakyIndex(vector_hits=[_AZUL, _BRASS], text_hits=[_BRASS]),
        reranker=FakeReranker(
            {_AZUL.id: 0.9, _BRASS.id: 0.95},
        ),
        candidates=40,
        top_k=6,
        min_relevance_score=0.35,
    )
    assert [hit.game_id for hit in hits] == ["azul"]


async def test_retrieve_returns_empty_when_all_scores_below_threshold() -> None:
    hits = await retrieve(
        question="Ile kafelków?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL], text_hits=[]),
        reranker=FakeReranker({_AZUL.id: 0.1}),
        candidates=40,
        top_k=6,
        min_relevance_score=0.35,
    )
    assert hits == []


async def test_retrieve_includes_expansion_when_in_game_set() -> None:
    hits = await retrieve(
        question="Kryształ?",
        game_ids=["azul", "azul-crystal"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL, _EXPANSION], text_hits=[]),
        reranker=FakeReranker({_AZUL.id: 0.4, _EXPANSION.id: 0.9}),
        candidates=40,
        top_k=6,
        min_relevance_score=0.35,
    )
    assert {hit.game_id for hit in hits} == {"azul", "azul-crystal"}


async def test_retrieve_excludes_expansion_when_not_in_game_set() -> None:
    hits = await retrieve(
        question="Kryształ?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL, _EXPANSION], text_hits=[_EXPANSION]),
        reranker=FakeReranker({_AZUL.id: 0.4, _EXPANSION.id: 0.99}),
        candidates=40,
        top_k=6,
        min_relevance_score=0.35,
    )
    assert [hit.game_id for hit in hits] == ["azul"]
