from rag_engine.ingest.ingest_percent import ingest_percent


def test_drawing_page_four_of_ten_is_stable() -> None:
    assert ingest_percent("drawing", 4, 10) == 52


def test_unknown_counts_stay_at_the_band_start() -> None:
    assert ingest_percent("saving", None, None) == 0
    assert ingest_percent("indexing", None, None) == 84


def test_completed_stage_hits_the_band_end() -> None:
    assert ingest_percent("reading", 10, 10) == 38
    assert ingest_percent("indexing", 8, 8) == 100
