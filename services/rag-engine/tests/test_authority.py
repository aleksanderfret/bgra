from rag_engine.authority import (
    has_rule_bearing_hit,
    order_relevant_hits,
    prefer_document,
    prefer_same_kind_document,
    sources_disagree,
)
from rag_engine.retrieval.types import RetrievedChunk


def test_same_kind_prefers_newer_indexed_at() -> None:
    assert prefer_same_kind_document("2024-01-01T00:00:00Z", "2023-01-01T00:00:00Z") == "left"
    assert prefer_same_kind_document("2023-01-01T00:00:00Z", "2024-01-01T00:00:00Z") == "right"
    assert prefer_same_kind_document("2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z") == "tie"


def test_higher_authority_kind_beats_newer_lower_kind() -> None:
    assert (
        prefer_document(
            "errata",
            "2020-01-01T00:00:00Z",
            "rulebook",
            "2025-01-01T00:00:00Z",
        )
        == "left"
    )


def test_same_kind_falls_back_to_indexed_at() -> None:
    assert (
        prefer_document(
            "rulebook",
            "2024-06-01T00:00:00Z",
            "rulebook",
            "2024-01-01T00:00:00Z",
        )
        == "left"
    )


def _chunk(
    *,
    chunk_id: str,
    kind: str,
    score: float,
    indexed_at: str = "2026-01-01T00:00:00Z",
) -> RetrievedChunk:
    return RetrievedChunk(
        id=chunk_id,
        game_id="azul",
        document_kind=kind,  # type: ignore[arg-type]
        doc_key="main",
        document_title="Azul",
        page=1,
        text="text",
        heading="Setup",
        image_url=None,
        indexed_at=indexed_at,
        score=score,
    )


def test_order_relevant_hits_prefers_errata_inside_near_tie_band() -> None:
    rulebook = _chunk(chunk_id="rb", kind="rulebook", score=0.80)
    errata = _chunk(chunk_id="er", kind="errata", score=0.75)
    ordered = order_relevant_hits([rulebook, errata])
    assert [hit.id for hit in ordered] == ["er", "rb"]


def test_order_relevant_hits_keeps_clear_score_winner_below_band() -> None:
    rulebook = _chunk(chunk_id="rb", kind="rulebook", score=0.90)
    errata = _chunk(chunk_id="er", kind="errata", score=0.20)
    ordered = order_relevant_hits([errata, rulebook])
    assert [hit.id for hit in ordered] == ["rb", "er"]


def test_order_relevant_hits_keeps_expansions_last() -> None:
    rulebook = _chunk(chunk_id="rb", kind="rulebook", score=0.50)
    expansion = _chunk(chunk_id="ex", kind="errata", score=0.0)
    ordered = order_relevant_hits([expansion, rulebook])
    assert [hit.id for hit in ordered] == ["rb", "ex"]


def test_has_rule_bearing_hit_rejects_transcript_only() -> None:
    transcript = _chunk(chunk_id="vt", kind="video_transcript", score=0.40)
    assert has_rule_bearing_hit([transcript]) is False
    rulebook = _chunk(chunk_id="rb", kind="rulebook", score=0.40)
    assert has_rule_bearing_hit([transcript, rulebook]) is True


def test_sources_disagree_detects_multiple_rule_kinds() -> None:
    rulebook = _chunk(chunk_id="rb", kind="rulebook", score=0.50)
    faq = _chunk(chunk_id="fq", kind="faq", score=0.40)
    assert sources_disagree([rulebook]) is False
    assert sources_disagree([rulebook, faq]) is True
