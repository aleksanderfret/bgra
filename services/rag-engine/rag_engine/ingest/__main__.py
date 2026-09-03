"""CLI: turn a PDF or YouTube URL into local chunks and page images."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rag_engine.contract import DOCUMENT_AUTHORITY, DocumentKind
from rag_engine.ingest.bgg_faq import BggUnavailableError, build_faq_chunks
from rag_engine.ingest.pdf import IngestExtraMissingError, PdfLimitError
from rag_engine.ingest.pipeline import ingest_chunks, ingest_pdf, ingest_rulebook
from rag_engine.ingest.transcript import build_transcript_chunks
from rag_engine.settings import Settings, get_settings
from rag_engine.storage_paths import InvalidGameIdError, StoragePathEscapeError

_KINDS: tuple[DocumentKind, ...] = DOCUMENT_AUTHORITY


def _maybe_fetch_faq(storage: Path, game_id: str, title: str) -> None:
    try:
        doc_key, faq_chunks = build_faq_chunks(game_id=game_id, title_query=title)
        ingest_chunks(
            storage,
            game_id=game_id,
            kind="faq",
            doc_key=doc_key,
            chunks=faq_chunks,
            title=title,
        )
    except BggUnavailableError as error:
        print(f"WARNING: community FAQ skipped: {error}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add", help="Ingest a PDF rulebook or a YouTube URL")
    add.add_argument("--game", required=True, help="Game id slug (directory name)")
    add.add_argument(
        "--kind",
        choices=_KINDS,
        default="rulebook",
        help="Document kind (default: rulebook)",
    )
    add.add_argument("--title", default=None, help="Display title for the game list")
    add.add_argument(
        "--fetch-community-faq",
        action="store_true",
        help="Also fetch BoardGameGeek thing description text (XMLAPI2 only)",
    )
    add.add_argument(
        "source",
        help="Path to a PDF, or a YouTube URL / video id when --kind video_transcript",
    )

    args = parser.parse_args(argv)
    settings: Settings = get_settings()
    storage = settings.storage_dir
    title = args.title or args.game

    try:
        if args.kind == "video_transcript":
            doc_key, chunks = build_transcript_chunks(
                game_id=args.game,
                url_or_id=args.source,
            )
            ingest_chunks(
                storage,
                game_id=args.game,
                kind="video_transcript",
                doc_key=doc_key,
                chunks=chunks,
                title=title,
            )
            if args.fetch_community_faq:
                _maybe_fetch_faq(storage, args.game, title)
        elif args.kind == "rulebook":
            ingest_rulebook(
                storage,
                game_id=args.game,
                pdf_path=Path(args.source),
                title=title,
                fetch_community_faq=args.fetch_community_faq,
            )
        else:
            ingest_pdf(
                storage,
                game_id=args.game,
                kind=args.kind,
                pdf_path=Path(args.source),
                title=title,
            )
            if args.fetch_community_faq:
                _maybe_fetch_faq(storage, args.game, title)

    except (InvalidGameIdError, StoragePathEscapeError, PdfLimitError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except FileNotFoundError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except IngestExtraMissingError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except SystemExit as error:
        code = error.code
        return int(code) if isinstance(code, int) else 1
    except Exception as error:
        print(f"error: ingest failed: {error}", file=sys.stderr)
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
