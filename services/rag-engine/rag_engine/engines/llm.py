"""Async Ollama client: tag listing and streamed chat completion."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx


class OllamaUnreachableError(Exception):
    pass


class ModelNotInstalledError(Exception):
    def __init__(self, model: str, installed: set[str]) -> None:
        self.model = model
        self.installed = installed
        super().__init__(f"Model {model!r} is not installed. Installed: {sorted(installed)}")


class GenerationTimeoutError(Exception):
    pass


# Default 5m lets embed evict the 14B chat model before the next question.
OLLAMA_KEEP_ALIVE = "30m"


async def installed_ollama_tags(ollama_url: str, *, timeout: float = 5.0) -> set[str]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{ollama_url.rstrip('/')}/api/tags")
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise OllamaUnreachableError(f"Cannot reach Ollama at {ollama_url}: {error}") from error

    payload = response.json()
    names: set[str] = set()
    for model in payload.get("models", []):
        name = model.get("name")
        if isinstance(name, str):
            names.add(name)
            if name.endswith(":latest"):
                names.add(name.removesuffix(":latest"))
    return names


def _chat_options(context_tokens: int) -> dict[str, int]:
    return {"num_ctx": context_tokens}


async def load_model(
    ollama_url: str,
    model: str,
    *,
    context_tokens: int,
    timeout_seconds: float = 180.0,
) -> None:
    url = f"{ollama_url.rstrip('/')}/api/generate"
    timeout = httpx.Timeout(connect=10.0, read=timeout_seconds, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url,
                json={
                    "model": model,
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                    "options": _chat_options(context_tokens),
                },
            )
    except httpx.ConnectError as error:
        raise OllamaUnreachableError(f"Cannot reach Ollama at {ollama_url}: {error}") from error
    if response.status_code == 404:
        raise ModelNotInstalledError(model, set())
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise OllamaUnreachableError(
            f"Ollama returned HTTP {error.response.status_code}: {error}"
        ) from error


async def generate_stream(
    ollama_url: str,
    model: str,
    messages: list[dict[str, str]],
    *,
    context_tokens: int,
    timeout_seconds: float = 300.0,
) -> AsyncIterator[str]:
    url = f"{ollama_url.rstrip('/')}/api/chat"
    # think is top-level: Qwen3 otherwise spends tens of seconds on a hidden
    # trace we never stream. num_ctx must match load_model or Ollama reloads.
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": False,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "options": _chat_options(context_tokens),
        }
    )

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(connect=10.0, read=timeout_seconds, write=10.0, pool=10.0),
    ) as client:
        try:
            async with client.stream(
                "POST",
                url,
                content=body,
                headers={"content-type": "application/json"},
            ) as response:
                if response.status_code == 404:
                    raise ModelNotInstalledError(model, set())
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    text = chunk.get("message", {}).get("content", "")
                    if text:
                        yield text
                    if chunk.get("done"):
                        return
        except httpx.ConnectError as error:
            raise OllamaUnreachableError(f"Cannot reach Ollama at {ollama_url}: {error}") from error
        except httpx.HTTPStatusError as error:
            raise OllamaUnreachableError(
                f"Ollama returned HTTP {error.response.status_code}: {error}"
            ) from error
        except httpx.ReadTimeout as error:
            raise GenerationTimeoutError(
                f"Ollama did not produce tokens within {timeout_seconds}s"
            ) from error
