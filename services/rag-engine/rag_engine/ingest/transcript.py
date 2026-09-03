"""YouTube transcript import (captions first; Whisper only if speech extra is present)."""

from __future__ import annotations

import importlib.util
import re
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from rag_engine.ingest.models import ChunkRecord, chunk_id_for_transcript
from rag_engine.storage_paths import slugify_doc_key

ProgressCallback = Callable[[str], None]

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str:
    candidate = url_or_id.strip()
    if _VIDEO_ID_RE.fullmatch(candidate):
        return candidate

    parsed = urlparse(candidate)
    if parsed.hostname in {"youtu.be"}:
        video_id = parsed.path.lstrip("/").split("/")[0]
        if _VIDEO_ID_RE.fullmatch(video_id):
            return video_id
    if parsed.hostname and "youtube" in parsed.hostname:
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_id and _VIDEO_ID_RE.fullmatch(query_id):
            return query_id
        parts = [part for part in parsed.path.split("/") if part]
        if (
            len(parts) >= 2
            and parts[0] in {"embed", "shorts", "live"}
            and _VIDEO_ID_RE.fullmatch(parts[1])
        ):
            return parts[1]

    raise ValueError(f"Could not parse a YouTube video id from {url_or_id!r}.")


def speech_extra_available() -> bool:
    """True when a speech-to-text backend from the speech extra can be imported."""
    return (
        importlib.util.find_spec("mlx_whisper") is not None
        or importlib.util.find_spec("faster_whisper") is not None
    )


def fetch_captions(video_id: str) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as error:
        raise SystemExit(
            "YouTube ingestion requires the ingest extra. Run: uv sync --extra ingest"
        ) from error

    api = YouTubeTranscriptApi()
    transcript = api.fetch(video_id)
    lines: list[str] = []
    for snippet in transcript:
        text = str(getattr(snippet, "text", "") or "").strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def _download_audio(video_id: str, dest_dir: Path) -> Path:
    try:
        import yt_dlp
    except ImportError as error:
        raise SystemExit(
            "YouTube audio download requires the ingest extra. Run: uv sync --extra ingest"
        ) from error

    outtmpl = str(dest_dir / f"{video_id}.%(ext)s")
    opts: dict[str, object] = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

    matches = list(dest_dir.glob(f"{video_id}.*"))
    if not matches:
        raise RuntimeError(f"yt-dlp did not produce an audio file for {video_id}.")
    return matches[0]


def _transcribe_with_whisper(audio_path: Path) -> str:
    if importlib.util.find_spec("mlx_whisper") is not None:
        import mlx_whisper

        result = mlx_whisper.transcribe(str(audio_path))
        text = result.get("text", "") if isinstance(result, dict) else ""
        return str(text).strip()

    if importlib.util.find_spec("faster_whisper") is None:
        raise RuntimeError("Speech extra is not installed. Run: uv sync --extra speech")

    from faster_whisper import WhisperModel

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(audio_path))
    return " ".join(segment.text.strip() for segment in segments).strip()


def fetch_transcript_text(
    video_id: str,
    *,
    progress: ProgressCallback | None = None,
) -> str:
    """Prefer captions; fall back to Whisper only when the speech extra is present."""
    try:
        if progress:
            progress(f"fetching captions for YouTube {video_id}")
        text = fetch_captions(video_id)
        if text.strip():
            return text
    except Exception as captions_error:
        if not speech_extra_available():
            raise RuntimeError(
                f"No captions available for YouTube video {video_id}. "
                "Install the speech extra for Whisper fallback "
                "(uv sync --extra speech), or add subtitles manually."
            ) from captions_error
        if progress:
            progress(f"captions unavailable; falling back to Whisper for {video_id}")
    else:
        if not speech_extra_available():
            raise RuntimeError(
                f"Captions for YouTube video {video_id} were empty. "
                "Install the speech extra for Whisper fallback "
                "(uv sync --extra speech), or add subtitles manually."
            )
        if progress:
            progress(f"captions empty; falling back to Whisper for {video_id}")

    work = Path(tempfile.mkdtemp(prefix="bga-yt-"))
    try:
        if progress:
            progress(f"downloading audio for YouTube {video_id}")
        audio_path = _download_audio(video_id, work)
        if progress:
            progress(f"transcribing YouTube {video_id} with Whisper")
        text = _transcribe_with_whisper(audio_path)
        if not text.strip():
            raise RuntimeError(f"Whisper produced empty text for YouTube video {video_id}.")
        return text
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _split_transcript_paragraphs(text: str) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    if len(paragraphs) == 1 and len(paragraphs[0]) > 1200:
        words = paragraphs[0].split()
        paragraphs = [
            " ".join(words[i : i + 180]) for i in range(0, len(words), 180) if words[i : i + 180]
        ]
    return paragraphs


def build_transcript_chunks(
    *,
    game_id: str,
    url_or_id: str,
    progress: ProgressCallback | None = None,
) -> tuple[str, list[ChunkRecord]]:
    video_id = extract_video_id(url_or_id)
    text = fetch_transcript_text(video_id, progress=progress)
    paragraphs = _split_transcript_paragraphs(text)
    doc_key = slugify_doc_key(f"yt-{video_id}", fallback="yt-video")

    chunks = [
        ChunkRecord(
            id=chunk_id_for_transcript(game_id, doc_key, index),
            game_id=game_id,
            document_kind="video_transcript",
            doc_key=doc_key,
            document_title=f"YouTube {video_id}",
            page=None,
            text=paragraph,
            heading="",
            image_url=None,
        )
        for index, paragraph in enumerate(paragraphs)
    ]
    return doc_key, chunks
