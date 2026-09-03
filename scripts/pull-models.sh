#!/usr/bin/env bash
#
# Pulls the models named by the active profile (developer convenience wrapper).
# The portable implementation lives in rag_engine.pull_models so Windows and the
# desktop app share the same logic.
#
# Usage:
#   ./scripts/pull-models.sh
#   ./scripts/pull-models.sh --skip-huggingface
#   Reads BGA_MODEL_PROFILE from services/rag-engine/.env (or the environment).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$REPO_ROOT/services/rag-engine"

if ! command -v ollama >/dev/null 2>&1; then
  echo "error: ollama is not installed. Install it from https://ollama.com/download" >&2
  exit 1
fi

if ! curl -sf --max-time 2 "${BGA_OLLAMA_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null; then
  echo "error: ollama is not responding. Start it with: ollama serve" >&2
  exit 1
fi

cd "$SERVICE_DIR"
exec uv run python -m rag_engine.pull_models "$@"
