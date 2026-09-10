"""Split streamed tokens into completed sentences for interleaved TTS."""

from __future__ import annotations

import re

_TERMINATORS = frozenset(".!?\u2026")
# ASCII closers only — avoid curly quotes that trip RUF001 in source.
_TRAILING_CLOSERS = frozenset("\"')]")

#: Lowercase tokens that often end with a period but are not sentence ends.
_ABBREVIATIONS = frozenset(
    {
        "np",
        "itd",
        "itp",
        "pkt",
        "str",
        "rys",
        "fig",
        "vol",
        "eg",
        "etc",
        "dr",
        "ul",
        "al",
        "ww",
        "tj",
        "tzn",
        "ok",
        "vs",
        "mr",
        "mrs",
        "ms",
        "st",
        "nr",
    }
)

_LIST_MARKER_RE = re.compile(r"^\d+$")
_LETTER_DOT_LETTER_RE = re.compile(r"[A-Za-z]\.[A-Za-z]\.?$")


def _token_before(buffer: str, terminator_index: int) -> str:
    start = terminator_index - 1
    while start >= 0 and not buffer[start].isspace():
        start -= 1
    return buffer[start + 1 : terminator_index]


def _is_abbreviation_or_list_marker(token: str) -> bool:
    if not token:
        return False
    stripped = token.rstrip(".")
    lower = stripped.lower()
    if lower in _ABBREVIATIONS:
        return True
    if _LIST_MARKER_RE.match(stripped) is not None:
        return True
    return _LETTER_DOT_LETTER_RE.search(token) is not None


def flush_completed_sentences(buffer: str) -> tuple[list[str], str]:
    """Return (completed sentences, remainder still accumulating).

    A sentence ends at `.` `!` `?` or ellipsis optionally followed by closers,
    then whitespace. Trailing incomplete text stays in the remainder — including
    a terminator at the end of the buffer (wait for the next token or force-flush).
    """
    completed: list[str] = []
    start = 0
    index = 0
    length = len(buffer)
    while index < length:
        char = buffer[index]
        if char not in _TERMINATORS:
            index += 1
            continue
        end = index + 1
        while end < length and buffer[end] in _TRAILING_CLOSERS:
            end += 1
        # Require whitespace after the terminator; do not flush on buffer EOF.
        if end >= length or not buffer[end].isspace():
            index += 1
            continue
        token = _token_before(buffer, index)
        if char == "." and _is_abbreviation_or_list_marker(token):
            index += 1
            continue
        piece = buffer[start:end].strip()
        if piece:
            completed.append(piece)
        while end < length and buffer[end].isspace():
            end += 1
        start = end
        index = end
    return completed, buffer[start:]


def force_flush_remainder(remainder: str) -> list[str]:
    """Emit any leftover text as a final spoken chunk (after LLM `done`)."""
    text = remainder.strip()
    return [text] if text else []
