def reciprocal_rank_fusion(
    ranked_id_lists: list[list[str]],
    *,
    limit: int,
    k: int = 60,
) -> list[str]:
    scores: dict[str, float] = {}
    for ranked in ranked_id_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    ordered = sorted(scores, key=lambda chunk_id: scores[chunk_id], reverse=True)
    return ordered[:limit]
