"""Server-sent-events encoding for the assistant stream.

One event per frame, JSON in the `data` field, camelCase keys. The reference
decoder on the other end lives in `packages/api-contract/src/event-stream.ts`.
"""

from .contract import AssistantEvent

SSE_MEDIA_TYPE = "text/event-stream"

#: `no-transform` and the buffering hint keep intermediate proxies from
#: holding frames back until the response completes, which would defeat the
#: point of streaming.
SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def encode_event(event: AssistantEvent) -> str:
    """Renders one event as an SSE frame.

    `model_dump_json` emits compact JSON with escaped newlines, so a payload
    can never accidentally introduce the blank line that ends a frame.
    """
    return f"data: {event.model_dump_json(by_alias=True)}\n\n"


def encode_comment(text: str = "keep-alive") -> str:
    """Renders an SSE comment, used to hold an idle connection open."""
    return f": {text}\n\n"
