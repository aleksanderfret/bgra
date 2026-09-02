#!/usr/bin/env bash
#
# Pulls the models named by the active profile.
#
# Model tags drift between releases, so this script is also the one place where
# a wrong identifier surfaces immediately and loudly, instead of at runtime in
# the middle of a game.
#
# Usage:
#   ./scripts/pull-models.sh
#   Reads BGA_MODEL_PROFILE from services/rag-engine/.env (or the environment).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$REPO_ROOT/services/rag-engine"

if ! command -v ollama >/dev/null 2>&1; then
  echo "error: ollama is not installed. Install it with: brew install ollama" >&2
  exit 1
fi

if ! curl -sf --max-time 2 "${BGA_OLLAMA_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null; then
  echo "error: ollama is not responding. Start it with: ollama serve" >&2
  exit 1
fi

# Ask the settings module rather than duplicating the profile here, so the
# script cannot fall out of step with the code.
profile_field() {
  (cd "$SERVICE_DIR" && uv run --quiet python -c "
from rag_engine.settings import get_settings
value = getattr(get_settings().profile, '$1')
print(value if value else '')
")
}

PROFILE_NAME="$(cd "$SERVICE_DIR" && uv run --quiet python -c "
from rag_engine.settings import get_settings
print(get_settings().model_profile)
")"
echo "Profile: $PROFILE_NAME"
echo

failed=0
for field in llm llm_arbiter embedding vision; do
  tag="$(profile_field "$field")"
  if [ -z "$tag" ]; then
    echo "· $field: not used by this profile, skipping"
    continue
  fi

  echo "▸ pulling $field: $tag"
  if ! ollama pull "$tag"; then
    echo "  error: '$tag' could not be pulled. Check the tag against the Ollama" >&2
    echo "  registry and correct it in rag_engine/settings.py." >&2
    failed=1
  fi
done

echo
echo "Handled by Python libraries on first use, not by Ollama:"
echo "  reranker: $(profile_field reranker)   (sentence-transformers)"
echo "  speech-to-text: $(profile_field stt)   (mlx-whisper)"
echo "  voice: $(profile_field tts_voice)   (piper-tts)"

if [ "$failed" -ne 0 ]; then
  echo
  echo "error: at least one model failed to download." >&2
  exit 1
fi

echo
echo "Done. Verify with: curl -s http://127.0.0.1:8000/health"
