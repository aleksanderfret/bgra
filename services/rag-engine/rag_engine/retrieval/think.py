"""Decide whether /ask should ask the chat model to think before answering."""

from __future__ import annotations

from collections.abc import Sequence

from rag_engine.contract import DocumentKind
from rag_engine.retrieval.types import RetrievedChunk
from rag_engine.settings import CHUNK_BUDGET_TOKENS, PROMPT_RESERVE_TOKENS

THINK_SCORE_MARGIN = 0.10
THINK_MIN_HEADROOM_TOKENS = 1500

_AUTHORITY_KINDS: frozenset[DocumentKind] = frozenset({"player_aid", "rulebook", "faq", "errata"})


def should_think(
    hits: Sequence[RetrievedChunk],
    min_relevance_score: float,
    context_tokens: int,
) -> bool:
    if not hits:
        return False

    headroom = context_tokens - PROMPT_RESERVE_TOKENS - len(hits) * CHUNK_BUDGET_TOKENS
    if headroom < THINK_MIN_HEADROOM_TOKENS:
        return False

    best = max(hit.score for hit in hits)
    if best < min_relevance_score + THINK_SCORE_MARGIN:
        return True

    authority = [hit for hit in hits if hit.document_kind in _AUTHORITY_KINDS]
    kinds = {hit.document_kind for hit in authority}
    if len(kinds) >= 2:
        return True

    booklets_by_kind: dict[DocumentKind, set[tuple[str, str]]] = {}
    for hit in authority:
        booklets_by_kind.setdefault(hit.document_kind, set()).add((hit.game_id, hit.doc_key))
    return any(len(booklets) >= 2 for booklets in booklets_by_kind.values())
