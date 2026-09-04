from rag_engine.retrieval.fuse import reciprocal_rank_fusion


def test_rrf_prefers_ids_high_in_both_lists() -> None:
    fused = reciprocal_rank_fusion(
        [["b", "a", "c"], ["b", "c", "a"]],
        limit=4,
    )
    assert fused[0] == "b"
    assert set(fused) == {"a", "b", "c"}


def test_rrf_caps_at_limit() -> None:
    fused = reciprocal_rank_fusion(
        [["a", "b", "c", "d"], ["d", "c", "b", "a"]],
        limit=2,
    )
    assert len(fused) == 2


def test_rrf_skips_empty_lists() -> None:
    fused = reciprocal_rank_fusion([[], ["only"]], limit=5)
    assert fused == ["only"]
