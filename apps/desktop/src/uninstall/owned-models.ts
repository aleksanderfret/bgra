interface OwnedModelsFile {
  ollamaTags: string[];
  huggingfaceRepos: string[];
}

/**
 * Keep in sync with owned-models.json (Python parity test + this module).
 * Inlined so packaged Electron does not need a JSON beside the compiled file.
 */
const OWNED_MODELS: OwnedModelsFile = {
  ollamaTags: [
    'bge-m3',
    'qwen2.5vl:7b',
    'qwen3:30b-a3b-instruct-2507-q4_K_M',
    'qwen3:32b',
    'qwen3:8b',
  ],
  huggingfaceRepos: ['BAAI/bge-reranker-v2-m3', 'mlx-community/whisper-large-v3-turbo'],
};

export function ownedOllamaTags(): string[] {
  return [...new Set(OWNED_MODELS.ollamaTags)].sort((a, b) => a.localeCompare(b));
}

export function ownedHuggingFaceRepos(): string[] {
  return [...new Set(OWNED_MODELS.huggingfaceRepos)].sort((a, b) => a.localeCompare(b));
}

/** Hugging Face hub on-disk folder for `org/name`. */
export function huggingfaceRepoToHubDirName(repoId: string): string {
  return `models--${repoId.replaceAll('/', '--')}`;
}
