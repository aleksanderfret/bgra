import { describe, expect, it } from 'vitest';
import {
  assertOllamaDownloadHost,
  assertOllamaInstallerUrl,
  ollamaInstallerBasename,
  ollamaInstallerUrl,
} from './ollama_runtime';

describe('ollamaInstallerUrl', () => {
  it('returns the fixed platform installers', () => {
    expect(ollamaInstallerUrl('darwin')).toBe('https://ollama.com/download/Ollama.dmg');
    expect(ollamaInstallerUrl('win32')).toBe('https://ollama.com/download/OllamaSetup.exe');
    expect(ollamaInstallerBasename('darwin')).toBe('Ollama.dmg');
  });

  it('rejects other platforms', () => {
    expect(() => ollamaInstallerUrl('linux')).toThrow(/Unsupported/);
  });
});

describe('allowlist guards', () => {
  it('accepts only the two installer URLs', () => {
    expect(() => assertOllamaInstallerUrl('https://ollama.com/download/Ollama.dmg')).not.toThrow();
    expect(() => assertOllamaInstallerUrl('https://evil.example/Ollama.dmg')).toThrow(
      /allowlisted/,
    );
  });

  it('allows the GitHub Releases hop Ollama uses today', () => {
    expect(() =>
      assertOllamaDownloadHost(
        'https://github.com/ollama/ollama/releases/download/v0.33.3/Ollama.dmg',
      ),
    ).not.toThrow();
    expect(() =>
      assertOllamaDownloadHost(
        'https://release-assets.githubusercontent.com/github-production-release-asset/1',
      ),
    ).not.toThrow();
  });

  it('rejects unrelated hosts', () => {
    expect(() => assertOllamaDownloadHost('https://evil.example/x')).toThrow(/allowlist/);
    expect(() =>
      assertOllamaDownloadHost('https://github.com/evil/repo/releases/download/v1/Ollama.dmg'),
    ).toThrow(/allowlist/);
  });
});
