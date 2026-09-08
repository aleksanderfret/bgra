from collections.abc import Sequence

import httpx

from rag_engine.engines.llm import (
    OLLAMA_KEEP_ALIVE,
    ModelNotInstalledError,
    OllamaUnreachableError,
)

QUERY_TIMEOUT_SECONDS = 30.0
INGEST_TIMEOUT_SECONDS = 120.0
#: Keep each Ollama request small so a loaded chat model does not OOM the embed step.
INGEST_EMBED_BATCH_SIZE = 32


def _parse_embeddings(payload: object, expected: int) -> list[list[float]]:
    if not isinstance(payload, dict):
        raise OllamaUnreachableError("Ollama embed response was not an object.")
    embeddings = payload.get("embeddings")
    if not isinstance(embeddings, list) or len(embeddings) != expected:
        raise OllamaUnreachableError("Ollama embed response did not match the input texts.")
    vectors: list[list[float]] = []
    for item in embeddings:
        if not isinstance(item, list) or not all(isinstance(value, int | float) for value in item):
            raise OllamaUnreachableError("Ollama embed response contained a non-vector row.")
        vectors.append([float(value) for value in item])
    return vectors


def _handle_embed_response(
    response: httpx.Response, model: str, expected: int
) -> list[list[float]]:
    if response.status_code == 404:
        raise ModelNotInstalledError(model, set())
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise OllamaUnreachableError(
            f"Ollama returned HTTP {error.response.status_code}: {error}"
        ) from error
    return _parse_embeddings(response.json(), expected)


def _map_transport_error(ollama_url: str, error: httpx.HTTPError) -> OllamaUnreachableError:
    if isinstance(error, httpx.TimeoutException):
        return OllamaUnreachableError(f"Ollama timed out while embedding at {ollama_url}: {error}")
    if isinstance(error, httpx.ConnectError):
        return OllamaUnreachableError(f"Cannot reach Ollama at {ollama_url}: {error}")
    return OllamaUnreachableError(f"Ollama request failed at {ollama_url}: {error}")


async def embed_texts(
    ollama_url: str,
    model: str,
    texts: Sequence[str],
    *,
    timeout_seconds: float = QUERY_TIMEOUT_SECONDS,
) -> list[list[float]]:
    if not texts:
        return []
    url = f"{ollama_url.rstrip('/')}/api/embed"
    timeout = httpx.Timeout(connect=10.0, read=timeout_seconds, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                json={
                    "model": model,
                    "input": list(texts),
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                },
            )
    except httpx.HTTPError as error:
        raise _map_transport_error(ollama_url, error) from error
    return _handle_embed_response(response, model, len(texts))


def embed_texts_sync(
    ollama_url: str,
    model: str,
    texts: Sequence[str],
    *,
    timeout_seconds: float = INGEST_TIMEOUT_SECONDS,
) -> list[list[float]]:
    if not texts:
        return []
    url = f"{ollama_url.rstrip('/')}/api/embed"
    timeout = httpx.Timeout(connect=10.0, read=timeout_seconds, write=10.0, pool=10.0)
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                url,
                json={
                    "model": model,
                    "input": list(texts),
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                },
            )
    except httpx.HTTPError as error:
        raise _map_transport_error(ollama_url, error) from error
    return _handle_embed_response(response, model, len(texts))


def embed_texts_sync_batched(
    ollama_url: str,
    model: str,
    texts: Sequence[str],
    *,
    batch_size: int = INGEST_EMBED_BATCH_SIZE,
    timeout_seconds: float = INGEST_TIMEOUT_SECONDS,
) -> list[list[float]]:
    if not texts:
        return []
    size = max(1, batch_size)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), size):
        batch = texts[start : start + size]
        vectors.extend(
            embed_texts_sync(
                ollama_url,
                model,
                batch,
                timeout_seconds=timeout_seconds,
            )
        )
    return vectors


class OllamaEmbedder:
    def __init__(self, ollama_url: str, model: str) -> None:
        self._url = ollama_url
        self._model = model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await embed_texts(self._url, self._model, texts)
