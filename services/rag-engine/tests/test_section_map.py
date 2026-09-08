from rag_engine.ingest.chunking import clean_heading
from rag_engine.ingest.models import ChunkRecord
from rag_engine.ingest.section_map import (
    BLOCK_KIND_CATALOGUE,
    BLOCK_KIND_RULE,
    SECTION_MAP_VERSION,
    build_catalogue_chunks,
    enrich_chunks,
    section_id_for,
)


def _chunk(**overrides: object) -> ChunkRecord:
    payload: dict[str, object] = {
        "id": "wo:rulebook:main:p12:c00",
        "game_id": "world-order",
        "document_kind": "rulebook",
        "doc_key": "main",
        "document_title": "World Order",
        "page": 12,
        "text": "body",
        "heading": "Handel (Ekonomiczna)",
    }
    payload.update(overrides)
    return ChunkRecord.model_validate(payload)


def test_clean_heading_strips_html_and_strikethrough() -> None:
    assert clean_heading("<u>Przemieszczenie (Wojskowa)</u>") == "Przemieszczenie (Wojskowa)"
    assert clean_heading("**Akcje**") == "Akcje"
    cleaned = clean_heading("<mark>Budow</mark> a** **<mark>Bazy (W</mark> o** **~~js~~ kowa)")
    assert "<mark>" not in cleaned
    assert "~~" not in cleaned
    assert "Bazy" in cleaned


def test_section_id_is_stable_for_the_same_cleaned_heading() -> None:
    assert section_id_for("Handel (Ekonomiczna)") == section_id_for("**Handel (Ekonomiczna)**")
    assert section_id_for("Handel (Ekonomiczna)") != section_id_for("Umocnienie (Dyplomatyczna)")


def test_enrich_chunks_sets_section_id_and_rule_kind() -> None:
    enriched = enrich_chunks(
        [
            _chunk(id="a", heading="Handel (Ekonomiczna)"),
            _chunk(id="b", heading="Handel (Ekonomiczna)", page=13),
        ]
    )
    assert enriched[0].block_kind == BLOCK_KIND_RULE
    assert enriched[0].section_id == enriched[1].section_id
    assert enriched[0].section_id == section_id_for("Handel (Ekonomiczna)")


def test_catalogue_lists_each_heading_once_in_document_order() -> None:
    chunks = enrich_chunks(
        [
            _chunk(id="a", heading="Akcje", page=12, text="overview"),
            _chunk(id="b", heading="Handel (Ekonomiczna)", page=13, text="trade"),
            _chunk(id="c", heading="Handel (Ekonomiczna)", page=13, text="more trade"),
            _chunk(id="d", heading="Produkcja (Wewnętrzna)", page=15, text="produce"),
        ]
    )
    catalogue = build_catalogue_chunks(chunks)
    assert len(catalogue) == 1
    cat = catalogue[0]
    assert cat.block_kind == BLOCK_KIND_CATALOGUE
    assert cat.section_id == "catalogue"
    assert "Akcje" in cat.text
    assert "Handel (Ekonomiczna)" in cat.text
    assert "Produkcja (Wewnętrzna)" in cat.text
    assert cat.text.index("Akcje") < cat.text.index("Handel")
    assert cat.text.count("Handel (Ekonomiczna)") == 1


def test_catalogue_is_skipped_when_there_are_no_named_sections() -> None:
    assert build_catalogue_chunks(enrich_chunks([_chunk(heading="", text="body")])) == []


def test_section_map_version_constant() -> None:
    assert SECTION_MAP_VERSION == 1
