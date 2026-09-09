/**
 * Optional dependency groups the packaged desktop engine must install.
 * Desktop is the player product — keep this list aligned with every stage
 * the web stack relies on (ingest, retrieval, speech).
 */
export const ENGINE_UV_SYNC_EXTRAS = ['retrieval', 'ingest', 'speech'] as const;

/** Full `uv sync` argv for the engine project (cwd = engine dir). */
export const engineUvSyncArgs = (): string[] => {
  const args = ['sync', '--frozen'];
  for (const extra of ENGINE_UV_SYNC_EXTRAS) {
    args.push('--extra', extra);
  }
  return args;
};
