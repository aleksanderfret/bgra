from dataclasses import dataclass, field

from rag_engine.retrieval.pipeline import keep_relevant, retrieve
from rag_engine.retrieval.types import RetrievedChunk

# The shipped defaults, spelled out: reading them from `Settings` would make
# these assertions depend on whoever's `.env` is on disk.
_FLOOR = 0.05
_SHARE = 0.20

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

_SECOND = RetrievedChunk(
    id="azul:rulebook:main:p09:c00",
    game_id="azul",
    document_kind="rulebook",
    doc_key="main",
    document_title="Azul",
    page=9,
    text="Table of contents.",
    heading="Contents",
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

    def find_by_section(
        self,
        game_ids: list[str],
        *,
        doc_key: str,
        section_id: str,
        limit: int,
    ) -> list[RetrievedChunk]:
        pool = [*self.vector_hits, *self.text_hits]
        hits = [
            hit
            for hit in pool
            if hit.game_id in game_ids
            and hit.doc_key == doc_key
            and hit.section_id == section_id
            and hit.block_kind != "catalogue"
        ]
        # Dedupe by id while preserving order.
        seen: set[str] = set()
        unique: list[RetrievedChunk] = []
        for hit in hits:
            if hit.id in seen:
                continue
            seen.add(hit.id)
            unique.append(hit)
        unique.sort(key=lambda chunk: (chunk.page is None, chunk.page or 0, chunk.id))
        return unique[:limit]

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
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    assert [hit.game_id for hit in hits] == ["azul"]


async def test_retrieve_returns_empty_when_the_best_passage_is_off_topic() -> None:
    hits = await retrieve(
        question="Ile kosztuje pizza?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL], text_hits=[]),
        reranker=FakeReranker({_AZUL.id: 0.0003}),
        candidates=40,
        top_k=6,
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    assert hits == []


async def test_retrieve_keeps_a_modest_best_hit_for_a_short_question() -> None:
    # A short question scores low even on the right passage, so an absolute
    # cut-off would answer "not in the rules" to "what does Trade do?".
    hits = await retrieve(
        question="Co daje akcja Handel?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL, _SECOND], text_hits=[]),
        reranker=FakeReranker({_AZUL.id: 0.13, _SECOND.id: 0.013}),
        candidates=40,
        top_k=6,
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    assert [hit.id for hit in hits] == [_AZUL.id]


async def test_retrieve_includes_expansion_when_in_game_set() -> None:
    hits = await retrieve(
        question="Kryształ?",
        game_ids=["azul", "azul-crystal"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[_AZUL, _EXPANSION], text_hits=[]),
        reranker=FakeReranker({_AZUL.id: 0.4, _EXPANSION.id: 0.9}),
        candidates=40,
        top_k=6,
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
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
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    assert [hit.game_id for hit in hits] == ["azul"]


def _kept(*scores: float) -> list[float]:
    passages = [_AZUL.model_copy(update={"id": f"c{index}"}) for index in range(len(scores))]
    kept = keep_relevant(
        list(zip(passages, scores, strict=True)),
        floor=_FLOOR,
        share_of_best=_SHARE,
    )
    return [chunk.score for chunk in kept]


def test_keep_relevant_uses_the_scores_measured_on_a_real_rulebook() -> None:
    # "how does the game end and who wins" — the whole ending, four passages.
    assert _kept(0.957, 0.653, 0.348, 0.240, 0.102) == [0.957, 0.653, 0.348, 0.240]
    # The same question asked in two words keeps its one good passage.
    assert _kept(0.126, 0.014, 0.013) == [0.126]
    # A question about something else entirely keeps nothing.
    assert _kept(0.0003, 0.0002, 0.0001) == []


def test_keep_relevant_survives_a_reranker_that_scores_everything_zero() -> None:
    assert _kept(0.0, 0.0) == []
    assert keep_relevant([], floor=_FLOOR, share_of_best=_SHARE) == []


def test_player_facing_hits_drop_the_catalogue() -> None:
    from rag_engine.retrieval.pipeline import player_facing_hits

    catalogue = _AZUL.model_copy(
        update={
            "id": "azul:rulebook:main:catalogue:c00",
            "block_kind": "catalogue",
            "section_id": "catalogue",
            "heading": "Contents",
            "text": "page 3: Setup\npage 4: Scoring",
        }
    )
    facing = player_facing_hits([catalogue, _AZUL])
    assert [hit.id for hit in facing] == [_AZUL.id]


async def test_retrieve_keeps_catalogue_for_the_model_and_expands_named_sections() -> None:
    from rag_engine.ingest.section_map import section_id_for

    trade = _AZUL.model_copy(
        update={
            "id": "wo:rulebook:main:p13:c00",
            "game_id": "world-order",
            "heading": "Handel (Ekonomiczna)",
            "section_id": section_id_for("Handel (Ekonomiczna)"),
            "text": "Trade lets you export.",
            "page": 13,
        }
    )
    invest = _AZUL.model_copy(
        update={
            "id": "wo:rulebook:main:p14:c00",
            "game_id": "world-order",
            "heading": "Inwestowanie (Ekonomiczna)",
            "section_id": section_id_for("Inwestowanie (Ekonomiczna)"),
            "text": "Invest in a country.",
            "page": 14,
        }
    )
    catalogue = _AZUL.model_copy(
        update={
            "id": "wo:rulebook:main:catalogue:c00",
            "game_id": "world-order",
            "block_kind": "catalogue",
            "section_id": "catalogue",
            "heading": "Contents",
            "page": None,
            "text": (
                "Section catalogue for this document.\n"
                "page 13: Handel (Ekonomiczna)\n"
                "page 14: Inwestowanie (Ekonomiczna)\n"
            ),
        }
    )
    index = FakeIndex(vector_hits=[catalogue, trade, invest], text_hits=[catalogue])
    hits = await retrieve(
        question="wyświetl listę akcji",
        game_ids=["world-order"],
        embedder=FakeEmbedder(),
        index=index,
        reranker=FakeReranker({catalogue.id: 0.9, trade.id: 0.1, invest.id: 0.1}),
        candidates=40,
        top_k=6,
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    ids = {hit.id for hit in hits}
    assert catalogue.id in ids
    assert trade.id in ids
    assert invest.id in ids


async def test_retrieve_does_not_expand_noise_back_into_a_short_question() -> None:
    from rag_engine.ingest.section_map import section_id_for

    trade = _AZUL.model_copy(
        update={
            "id": "trade",
            "heading": "Handel",
            "section_id": section_id_for("Handel"),
            "text": "Trade action body",
        }
    )
    noise = _AZUL.model_copy(
        update={
            "id": "noise",
            "heading": "Handel",
            "section_id": section_id_for("Handel"),
            "text": "unrelated second piece of Handel",
            "page": 99,
        }
    )
    # Only trade clears the filter; noise is a sibling in the same short section
    # (2 chunks <= 6), so expansion WOULD pull it — wait, that's intentional for
    # multi-chunk sections. For the "noise" regression we need a different section
    # that scored low and must not come back via expansion of an unrelated hit.
    other = _AZUL.model_copy(
        update={
            "id": "toc",
            "heading": "Spis treści",
            "section_id": section_id_for("Spis treści"),
            "text": "table of contents noise",
            "page": 2,
        }
    )
    hits = await retrieve(
        question="Co daje akcja Handel?",
        game_ids=["azul"],
        embedder=FakeEmbedder(),
        index=FakeIndex(vector_hits=[trade, noise, other], text_hits=[]),
        reranker=FakeReranker({trade.id: 0.13, noise.id: 0.01, other.id: 0.01}),
        candidates=40,
        top_k=6,
        min_relevance_score=_FLOOR,
        relevance_share_of_best=_SHARE,
    )
    # trade clears; noise is same section (2 chunks) so sibling expansion may add it.
    # other must not return — different section, failed the filter.
    assert other.id not in {hit.id for hit in hits}
    assert trade.id in {hit.id for hit in hits}
