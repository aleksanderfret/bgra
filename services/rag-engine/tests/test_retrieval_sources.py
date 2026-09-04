from rag_engine.contract import RetrievedSource
from rag_engine.retrieval.sources import excerpt_text, to_retrieved_source
from rag_engine.retrieval.types import RetrievedChunk


def test_excerpt_collapses_whitespace_and_caps_at_240() -> None:
    text = "A" * 300 + "\n\n" + "B" * 10
    excerpt = excerpt_text("  hello   \n\n  world  ")
    assert excerpt == "hello world"
    assert len(excerpt_text(text)) == 240


def test_to_retrieved_source_keeps_relative_image_url() -> None:
    chunk = RetrievedChunk(
        id="azul:rulebook:main:p03:c00",
        game_id="azul",
        document_kind="rulebook",
        doc_key="main",
        document_title="Azul",
        page=3,
        text="Draw four tiles from the factory displays.",
        heading="Setup",
        image_url="/static/assets/azul/documents/rulebook/main/p03.png",
        indexed_at="2026-01-01T00:00:00Z",
        score=0.81,
    )
    source = to_retrieved_source(chunk)
    assert source == RetrievedSource(
        id=chunk.id,
        game_id="azul",
        document_title="Azul",
        document_kind="rulebook",
        page=3,
        score=0.81,
        excerpt="Draw four tiles from the factory displays.",
        image_url="/static/assets/azul/documents/rulebook/main/p03.png",
    )
