"""Split streamed tokens into completed sentences for interleaved TTS."""

from __future__ import annotations

_TERMINATORS = frozenset(".!?\u2026")
# ASCII closers only — avoid curly quotes that trip RUF001 in source.
_TRAILING_CLOSERS = frozenset("\"')]")


def flush_completed_sentences(buffer: str) -> tuple[list[str], str]:
    """Return (completed sentences, remainder still accumulating).

    A sentence ends at `.` `!` `?` or ellipsis optionally followed by closers,
    then whitespace. Trailing incomplete text stays in the remainder.
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
        if end < length and not buffer[end].isspace():
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
