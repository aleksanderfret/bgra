"""Document authority helpers used when ranking conflicting passages."""

from __future__ import annotations

from typing import Literal

from rag_engine.contract import DOCUMENT_AUTHORITY, DocumentKind

Preference = Literal["left", "right", "tie"]


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
