"""SSE frames: one event, JSON in `data`, camelCase keys."""

from .contract import AssistantEvent

SSE_MEDIA_TYPE = "text/event-stream"

#: `no-transform` / `X-Accel-Buffering` stop proxies from holding the stream.
SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def encode_event(event: AssistantEvent) -> str:
    # Compact JSON escapes newlines, so a payload cannot end a frame early.
    return f"data: {event.model_dump_json(by_alias=True)}\n\n"


def encode_comment(text: str = "keep-alive") -> str:
    return f": {text}\n\n"
