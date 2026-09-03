from pathlib import Path
from unittest.mock import patch

import pytest

from rag_engine.ingest.bgg_faq import BggUnavailableError, build_faq_chunks
from rag_engine.ingest.pipeline import ingest_chunks, ingest_pdf
from rag_engine.ingest.registry import load_games
from rag_engine.ingest.transcript import build_transcript_chunks, extract_video_id


def test_extract_video_id_from_url() -> None:
    assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_build_transcript_chunks_from_captions() -> None:
    with patch(
        "rag_engine.ingest.transcript.fetch_captions",
        return_value="Hello board game.\n\nSecond paragraph here.",
    ):
        doc_key, chunks = build_transcript_chunks(
            game_id="azul",
            url_or_id="dQw4w9WgXcQ",
        )
    assert doc_key == "yt-dQw4w9WgXcQ"
    assert len(chunks) == 2
    assert chunks[0].document_kind == "video_transcript"
    assert chunks[0].page is None
    assert chunks[0].image_url is None


def test_missing_captions_without_speech_is_readable_error() -> None:
    with (
        patch(
            "rag_engine.ingest.transcript.fetch_captions",
            side_effect=RuntimeError("no captions"),
        ),
        patch("rag_engine.ingest.transcript.speech_extra_available", return_value=False),
        pytest.raises(RuntimeError, match="speech extra"),
    ):
        build_transcript_chunks(game_id="azul", url_or_id="dQw4w9WgXcQ")


def test_bgg_faq_chunks_from_description() -> None:
    with (
        patch("rag_engine.ingest.bgg_faq.search_thing_id", return_value=123),
        patch(
            "rag_engine.ingest.bgg_faq.fetch_thing_description",
            return_value=("Azul", "A tile game.\n\nPlayers take turns."),
        ),
    ):
        doc_key, chunks = build_faq_chunks(game_id="azul", title_query="Azul")
    assert doc_key == "bgg-123"
    assert all(chunk.document_kind == "faq" for chunk in chunks)
    assert len(chunks) >= 1


def test_bgg_soft_fail_does_not_break_pdf(tmp_path: Path) -> None:
    import pymupdf

    storage = tmp_path / "storage"
    storage.mkdir()
    pdf = tmp_path / "demo.pdf"
    doc = pymupdf.open()  # type: ignore[no-untyped-call,unused-ignore]
    page = doc.new_page()
    page.insert_text((72, 72), "# Setup\n\nDraw.")
    doc.save(pdf)  # type: ignore[no-untyped-call,unused-ignore]
    doc.close()  # type: ignore[no-untyped-call,unused-ignore]

    ingest_pdf(storage, game_id="azul", kind="rulebook", pdf_path=pdf, title="Azul")

    with (
        patch(
            "rag_engine.ingest.bgg_faq.build_faq_chunks",
            side_effect=BggUnavailableError("offline"),
        ),
        pytest.raises(BggUnavailableError),
    ):
        build_faq_chunks(game_id="azul", title_query="Azul")

    games = load_games(storage)
    assert games[0].chunk_count > 0
    assert "rulebook" in games[0].document_kinds


def test_ingest_faq_chunks(tmp_path: Path) -> None:
    storage = tmp_path / "storage"
    storage.mkdir()
    with (
        patch("rag_engine.ingest.bgg_faq.search_thing_id", return_value=99),
        patch(
            "rag_engine.ingest.bgg_faq.fetch_thing_description",
            return_value=("Demo", "Official clarification text."),
        ),
    ):
        doc_key, chunks = build_faq_chunks(game_id="demo", title_query="Demo")
    ingest_chunks(
        storage,
        game_id="demo",
        kind="faq",
        doc_key=doc_key,
        chunks=chunks,
        title="Demo",
    )
    games = load_games(storage)
    assert games[0].document_kinds == ["faq"]
