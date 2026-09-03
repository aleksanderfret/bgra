from rag_engine.authority import prefer_document, prefer_same_kind_document


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
