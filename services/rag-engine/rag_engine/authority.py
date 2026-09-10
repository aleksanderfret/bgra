"""Document authority helpers used when ranking conflicting passages."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from rag_engine.contract import DOCUMENT_AUTHORITY, DocumentKind
from rag_engine.retrieval.types import RetrievedChunk

Preference = Literal["left", "right", "tie"]

#: Kinds that can establish a rule. Transcripts are style only.
RULE_BEARING_KINDS: frozenset[DocumentKind] = frozenset({"player_aid", "rulebook", "faq", "errata"})

#: Within this share of the best score, higher-authority kinds win the order.
AUTHORITY_NEAR_TIE_SHARE = 0.9


def authority_rank(kind: DocumentKind) -> int:
    """Higher means stronger authority (errata beats rulebook, etc.)."""
    return DOCUMENT_AUTHORITY.index(kind)


def prefer_same_kind_document(left_indexed_at: str, right_indexed_at: str) -> Preference:
    """When two documents share a kind, prefer the newer `indexedAt` (ISO-8601)."""
    if left_indexed_at > right_indexed_at:
        return "left"
    if right_indexed_at > left_indexed_at:
        return "right"
    return "tie"


def prefer_document(
    left_kind: DocumentKind,
    left_indexed_at: str,
    right_kind: DocumentKind,
    right_indexed_at: str,
) -> Preference:
    left_rank = authority_rank(left_kind)
    right_rank = authority_rank(right_kind)
    if left_rank > right_rank:
        return "left"
    if right_rank > left_rank:
        return "right"
    return prefer_same_kind_document(left_indexed_at, right_indexed_at)


def has_rule_bearing_hit(hits: Sequence[RetrievedChunk]) -> bool:
    """True when at least one scored passage can establish a rule."""
    return any(hit.score > 0.0 and hit.document_kind in RULE_BEARING_KINDS for hit in hits)


def sources_disagree(hits: Sequence[RetrievedChunk]) -> bool:
    """True when two or more rule-bearing kinds survived relevance."""
    kinds = {
        hit.document_kind
        for hit in hits
        if hit.score > 0.0 and hit.document_kind in RULE_BEARING_KINDS
    }
    return len(kinds) >= 2


def order_relevant_hits(hits: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Score first; within ~90% of best, prefer higher authority / newer index.

    Expansions (score 0) stay after every scored hit — do not promote them by kind.
    """
    scored = [hit for hit in hits if hit.score > 0.0]
    expansions = [hit for hit in hits if hit.score <= 0.0]
    if not scored:
        return list(hits)

    best = max(hit.score for hit in scored)
    band = best * AUTHORITY_NEAR_TIE_SHARE
    in_band = [hit for hit in scored if hit.score >= band]
    below = [hit for hit in scored if hit.score < band]

    # Stable multi-pass: last sort is the primary key.
    in_band.sort(key=lambda hit: hit.indexed_at, reverse=True)
    in_band.sort(key=lambda hit: hit.score, reverse=True)
    in_band.sort(key=lambda hit: authority_rank(hit.document_kind), reverse=True)

    below.sort(key=lambda hit: hit.indexed_at, reverse=True)
    below.sort(key=lambda hit: authority_rank(hit.document_kind), reverse=True)
    below.sort(key=lambda hit: hit.score, reverse=True)

    return [*in_band, *below, *expansions]
