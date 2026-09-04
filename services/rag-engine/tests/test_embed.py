from unittest.mock import AsyncMock, patch

import httpx
import pytest

from rag_engine.engines.embed import embed_texts
from rag_engine.engines.llm import ModelNotInstalledError, OllamaUnreachableError


@pytest.mark.asyncio
async def test_embed_texts_posts_to_api_embed_and_returns_vectors() -> None:
    response = httpx.Response(
        200,
        json={"embeddings": [[0.1, 0.2], [0.3, 0.4]]},
        request=httpx.Request("POST", "http://127.0.0.1:11434/api/embed"),
    )
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post = AsyncMock(return_value=response)

    with patch("rag_engine.engines.embed.httpx.AsyncClient", return_value=mock_client):
        vectors = await embed_texts(
            "http://127.0.0.1:11434",
            "bge-m3",
            ["hello", "world"],
        )

    assert vectors == [[0.1, 0.2], [0.3, 0.4]]
    mock_client.post.assert_awaited_once()
    args, kwargs = mock_client.post.call_args
    assert args[0] == "http://127.0.0.1:11434/api/embed"
    assert kwargs["json"] == {"model": "bge-m3", "input": ["hello", "world"]}


@pytest.mark.asyncio
async def test_embed_texts_maps_404_to_model_missing() -> None:
    response = httpx.Response(
        404,
        request=httpx.Request("POST", "http://127.0.0.1:11434/api/embed"),
    )
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post = AsyncMock(return_value=response)

    with (
        patch("rag_engine.engines.embed.httpx.AsyncClient", return_value=mock_client),
        pytest.raises(ModelNotInstalledError),
    ):
        await embed_texts("http://127.0.0.1:11434", "bge-m3", ["hello"])


@pytest.mark.asyncio
async def test_embed_texts_maps_connect_error() -> None:
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("down"))

    with (
        patch("rag_engine.engines.embed.httpx.AsyncClient", return_value=mock_client),
        pytest.raises(OllamaUnreachableError),
    ):
        await embed_texts("http://127.0.0.1:11434", "bge-m3", ["hello"])
