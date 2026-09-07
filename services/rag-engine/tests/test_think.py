from rag_engine.contract import DocumentKind
from rag_engine.retrieval.think import should_think
from rag_engine.retrieval.types import RetrievedChunk

_MIN = 0.35
_STARTER_CTX = 8192
_MINIMAL_CTX = 4096


def _chunk(
    *,
    game_id: str = "azul",
    kind: DocumentKind = "rulebook",
    doc_key: str = "main",
    page: int = 3,
    score: float = 0.9,
) -> RetrievedChunk:
    return RetrievedChunk(
        id=f"{game_id}:{kind}:{doc_key}:p{page:02d}:c00",
        game_id=game_id,
        document_kind=kind,
        doc_key=doc_key,
        document_title=game_id,
        page=page,
        text="Sample passage.",
        score=score,
    )


def test_one_clear_rulebook_hit_does_not_think() -> None:
    assert should_think([_chunk(score=0.9)], _MIN, _STARTER_CTX) is False


def test_near_miss_score_turns_thinking_on() -> None:
    assert should_think([_chunk(score=0.36)], _MIN, _STARTER_CTX) is True


def test_score_on_margin_boundary_stays_off() -> None:
    assert should_think([_chunk(score=0.45)], _MIN, _STARTER_CTX) is False


def test_rulebook_and_errata_turns_thinking_on() -> None:
    hits = [
        _chunk(kind="rulebook", doc_key="main"),
        _chunk(kind="errata", doc_key="errata", page=1),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True


def test_rulebook_and_faq_turns_thinking_on() -> None:
    hits = [
        _chunk(kind="rulebook"),
        _chunk(kind="faq", doc_key="faq", page=1),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True


def test_player_aid_and_rulebook_turns_thinking_on() -> None:
    hits = [
        _chunk(kind="player_aid", doc_key="aid", page=1),
        _chunk(kind="rulebook"),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True


def test_rulebook_plus_transcript_does_not_think() -> None:
    hits = [
        _chunk(kind="rulebook"),
        _chunk(kind="video_transcript", doc_key="howto", page=1),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is False


def test_two_pages_of_same_booklet_do_not_think() -> None:
    hits = [
        _chunk(doc_key="main", page=3),
        _chunk(doc_key="main", page=4),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is False


def test_two_booklets_same_game_same_kind_turns_thinking_on() -> None:
    hits = [
        _chunk(doc_key="main", page=3),
        _chunk(doc_key="solo", page=1),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True


def test_base_and_expansion_main_rulebooks_turn_thinking_on() -> None:
    hits = [
        _chunk(game_id="azul", doc_key="main", page=3),
        _chunk(game_id="azul-crystal", doc_key="main", page=1),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True


def test_empty_hits_do_not_think() -> None:
    assert should_think([], _MIN, _STARTER_CTX) is False


def test_minimal_profile_headroom_blocks_thinking() -> None:
    hits = [
        _chunk(kind="rulebook", doc_key="main", page=1),
        _chunk(kind="errata", doc_key="errata", page=1),
        _chunk(kind="rulebook", doc_key="main", page=2),
    ]
    assert should_think(hits, _MIN, _MINIMAL_CTX) is False


def test_starter_profile_with_six_hits_still_allows_thinking() -> None:
    hits = [
        _chunk(kind="rulebook", doc_key="main", page=1),
        _chunk(kind="errata", doc_key="errata", page=1),
        _chunk(kind="rulebook", doc_key="main", page=2),
        _chunk(kind="rulebook", doc_key="main", page=3),
        _chunk(kind="rulebook", doc_key="main", page=4),
        _chunk(kind="rulebook", doc_key="main", page=5),
    ]
    assert should_think(hits, _MIN, _STARTER_CTX) is True
