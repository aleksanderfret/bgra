import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from rag_engine.engines.llm import OLLAMA_KEEP_ALIVE, generate_stream, load_model


class _ChatStream:
    def __init__(self, lines: list[str]) -> None:
        self._lines = lines
        self.status_code = 200

    async def __aenter__(self) -> _ChatStream:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self) -> AsyncIterator[str]:
        for line in self._lines:
            yield line


@pytest.mark.asyncio
async def test_generate_stream_skips_thinking_and_keeps_the_model_loaded() -> None:
    stream = _ChatStream(
        [
            json.dumps({"message": {"content": "Hi"}, "done": False}),
            json.dumps({"message": {"content": ""}, "done": True}),
        ]
    )
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.stream = MagicMock(return_value=stream)

    with patch("rag_engine.engines.llm.httpx.AsyncClient", return_value=mock_client):
        tokens = [
            token
            async for token in generate_stream(
                "http://127.0.0.1:11434",
                "qwen3:14b",
                [{"role": "user", "content": "q"}],
                context_tokens=8192,
            )
        ]

    assert tokens == ["Hi"]
    _args, kwargs = mock_client.stream.call_args
    payload = json.loads(kwargs["content"])
    assert payload["think"] is False
    assert payload["keep_alive"] == OLLAMA_KEEP_ALIVE
    assert payload["stream"] is True
    assert payload["options"] == {"num_ctx": 8192}


@pytest.mark.asyncio
async def test_load_model_posts_generate_without_a_prompt() -> None:
    response = httpx.Response(
        200,
        json={"done": True},
        request=httpx.Request("POST", "http://127.0.0.1:11434/api/generate"),
    )
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post = AsyncMock(return_value=response)

    with patch("rag_engine.engines.llm.httpx.AsyncClient", return_value=mock_client):
        await load_model(
            "http://127.0.0.1:11434",
            "qwen3:14b",
            context_tokens=8192,
        )

    args, kwargs = mock_client.post.call_args
    assert args[0] == "http://127.0.0.1:11434/api/generate"
    assert kwargs["json"] == {
        "model": "qwen3:14b",
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {"num_ctx": 8192},
    }
