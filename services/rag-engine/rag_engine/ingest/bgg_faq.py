"""Optional BoardGameGeek FAQ text via XMLAPI2 only (never Files / HTML scrape)."""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable

from rag_engine.ingest.models import ChunkRecord, chunk_id_for_faq

USER_AGENT = "BGA-rules-assistant/0.1 (local; +https://github.com/aleksanderfret/bgra)"
REQUEST_GAP_SECONDS = 1.0
TIMEOUT_SECONDS = 15.0

ProgressCallback = Callable[[str], None]


class BggUnavailableError(Exception):
    pass


def _get(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw: object = response.read()
    except urllib.error.URLError as error:
        raise BggUnavailableError(f"BoardGameGeek is unreachable: {error}") from error
    if not isinstance(raw, (bytes, bytearray)):
        raise BggUnavailableError("BoardGameGeek returned a non-bytes body.")
    return bytes(raw).decode("utf-8", errors="replace")


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", text).strip()


def search_thing_id(query: str) -> int | None:
    encoded = urllib.parse.quote(query)
    url = f"https://boardgamegeek.com/xmlapi2/search?query={encoded}&type=boardgame"
    root = ET.fromstring(_get(url))
    item = root.find("item")
    if item is None:
        return None
    raw_id = item.get("id")
    return int(raw_id) if raw_id else None


def fetch_thing_description(thing_id: int) -> tuple[str, str]:
    """Return (primary name, plain-text description)."""
    time.sleep(REQUEST_GAP_SECONDS)
    url = f"https://boardgamegeek.com/xmlapi2/thing?id={thing_id}&stats=0"
    root = ET.fromstring(_get(url))
    item = root.find("item")
    if item is None:
        raise BggUnavailableError(f"BoardGameGeek thing {thing_id} not found.")

    name = ""
    for name_el in item.findall("name"):
        if name_el.get("type") == "primary":
            name = name_el.get("value") or ""
            break
    if not name:
        first = item.find("name")
        name = (first.get("value") if first is not None else "") or f"bgg-{thing_id}"

    description_el = item.find("description")
    description = _strip_html(description_el.text or "") if description_el is not None else ""
    return name, description


def build_faq_chunks(
    *,
    game_id: str,
    title_query: str,
    progress: ProgressCallback | None = None,
) -> tuple[str, list[ChunkRecord]]:
    """Search BGG and turn the thing description into faq chunks.

    Returns (doc_key, chunks). Raises BggUnavailableError on network / empty results.
    """
    if progress:
        progress(f"searching BoardGameGeek for {title_query!r}")
    thing_id = search_thing_id(title_query)
    if thing_id is None:
        raise BggUnavailableError(f"No BoardGameGeek match for {title_query!r}.")

    name, description = fetch_thing_description(thing_id)
    if not description:
        raise BggUnavailableError(
            f"BoardGameGeek thing {thing_id} ({name}) has no description text."
        )

    doc_key = f"bgg-{thing_id}"
    # Split long descriptions into paragraphs as separate chunks.
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", description) if part.strip()]
    if not paragraphs:
        paragraphs = [description]

    chunks: list[ChunkRecord] = []
    for index, paragraph in enumerate(paragraphs):
        chunks.append(
            ChunkRecord(
                id=chunk_id_for_faq(game_id, doc_key, index),
                game_id=game_id,
                document_kind="faq",
                doc_key=doc_key,
                document_title=name,
                page=None,
                text=paragraph,
                heading=name if index == 0 else "",
                image_url=None,
            )
        )
    return doc_key, chunks
