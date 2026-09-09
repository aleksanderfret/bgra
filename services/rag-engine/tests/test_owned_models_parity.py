"""Parity: desktop owned-models.json matches Ollama/HF ids in PROFILES."""

from __future__ import annotations

import json
from pathlib import Path

from rag_engine.settings import PROFILES

_REPO_ROOT = Path(__file__).resolve().parents[3]
_OWNED_MODELS = _REPO_ROOT / "apps" / "desktop" / "src" / "uninstall" / "owned-models.json"


def _profile_ollama_tags() -> set[str]:
    tags: set[str] = set()
    for profile in PROFILES.values():
        tags.add(profile.llm)
        tags.add(profile.embedding)
        if profile.llm_arbiter is not None:
            tags.add(profile.llm_arbiter)
        if profile.vision is not None:
            tags.add(profile.vision)
    return tags


def _profile_huggingface_repos() -> set[str]:
    repos: set[str] = set()
    for profile in PROFILES.values():
        repos.add(profile.reranker)
        if profile.stt is not None:
            repos.add(profile.stt)
    return repos


def test_owned_models_json_matches_profiles() -> None:
    payload = json.loads(_OWNED_MODELS.read_text(encoding="utf-8"))
    assert set(payload["ollamaTags"]) == _profile_ollama_tags()
    assert set(payload["huggingfaceRepos"]) == _profile_huggingface_repos()
