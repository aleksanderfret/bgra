import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const OLLAMA_DOWNLOAD_PAGE = 'https://ollama.com/download';

export function ollamaInstallerUrl(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'https://ollama.com/download/OllamaSetup.exe';
  }
  if (platform === 'darwin') {
    return 'https://ollama.com/download/Ollama.dmg';
  }
  throw new Error(`Unsupported platform for Ollama installer: ${platform}`);
}

export function ollamaInstallerBasename(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'OllamaSetup.exe';
  }
  if (platform === 'darwin') {
    return 'Ollama.dmg';
  }
  throw new Error(`Unsupported platform for Ollama installer: ${platform}`);
}

export function assertOllamaInstallerUrl(url: string): void {
  const allowed = new Set([
    'https://ollama.com/download/Ollama.dmg',
    'https://ollama.com/download/OllamaSetup.exe',
  ]);
  if (!allowed.has(url)) {
    throw new Error(`Refused non-allowlisted installer URL: ${url}`);
  }
}

export function assertOllamaDownloadHost(finalUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    throw new Error(`Invalid download URL: ${finalUrl}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Refused non-HTTPS installer redirect: ${finalUrl}`);
  }
  const host = parsed.hostname;
  if (host === 'ollama.com') {
    return;
  }
  // ollama.com/download/* currently 307s through GitHub Releases + CDN.
  if (
    host === 'github.com' &&
    parsed.pathname.includes('/ollama/ollama/') &&
    parsed.pathname.includes('/Ollama.')
  ) {
    return;
  }
  if (
    host === 'release-assets.githubusercontent.com' ||
    host === 'objects.githubusercontent.com' ||
    host === 'github-releases.githubusercontent.com'
  ) {
    return;
  }
  throw new Error(`Refused installer redirect off allowlist: ${finalUrl}`);
}

export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
};

export async function downloadAllowlistedFile(options: {
  url: string;
  destinationPath: string;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<void> {
  assertOllamaInstallerUrl(options.url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Installer download failed with status ${response.status}`);
  }
  assertOllamaDownloadHost(response.url);
  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  if (totalBytes !== null && (!Number.isFinite(totalBytes) || totalBytes < 1_000_000)) {
    throw new Error('Installer download looks too small to be genuine');
  }
  mkdirSync(dirname(options.destinationPath), { recursive: true });
  if (response.body === null) {
    throw new Error('Installer download returned an empty body');
  }

  const file = createWriteStream(options.destinationPath);
  let receivedBytes = 0;
  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  nodeStream.on('data', (chunk: Buffer | string) => {
    const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    receivedBytes += size;
    options.onProgress?.({ receivedBytes, totalBytes });
  });
  await pipeline(nodeStream, file);
  if (!existsSync(options.destinationPath)) {
    throw new Error('Installer file was not written');
  }
}

export function installerDestination(userDataDir: string, platform: NodeJS.Platform): string {
  return join(userDataDir, 'downloads', ollamaInstallerBasename(platform));
}
