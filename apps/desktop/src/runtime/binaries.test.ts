import { describe, expect, it } from 'vitest';
import { BinaryNotFoundError, candidatePathsFor, resolveBinary } from './binaries';

describe('candidatePathsFor', () => {
  it('lists Homebrew and user-local paths for uv on macOS', () => {
    const paths = candidatePathsFor('uv', 'darwin', '/Users/ada');

    expect(paths).toEqual([
      '/Users/ada/.local/bin/uv',
      '/opt/homebrew/bin/uv',
      '/usr/local/bin/uv',
    ]);
  });

  it('includes Ollama.app on macOS', () => {
    const paths = candidatePathsFor('ollama', 'darwin', '/Users/ada');

    expect(paths).toContain('/Applications/Ollama.app/Contents/Resources/ollama');
    expect(paths).toContain('/opt/homebrew/bin/ollama');
  });

  it('lists Windows Program Files locations', () => {
    const paths = candidatePathsFor('ollama', 'win32', 'C:\\Users\\ada');

    expect(paths.some((path) => path.endsWith('ollama.exe'))).toBe(true);
  });
});

describe('resolveBinary', () => {
  it('returns the first existing candidate', () => {
    const resolved = resolveBinary({
      name: 'uv',
      platform: 'darwin',
      homeDir: '/Users/ada',
      exists: (path) => path === '/opt/homebrew/bin/uv',
    });

    expect(resolved).toBe('/opt/homebrew/bin/uv');
  });

  it('prefers a bundled binary over system candidates', () => {
    const resolved = resolveBinary({
      name: 'uv',
      platform: 'darwin',
      homeDir: '/Users/ada',
      prefer: ['/App/Contents/Resources/uv'],
      exists: (path) => path === '/App/Contents/Resources/uv' || path === '/opt/homebrew/bin/uv',
    });

    expect(resolved).toBe('/App/Contents/Resources/uv');
  });

  it('throws a readable error listing every place that was checked', () => {
    expect(() =>
      resolveBinary({
        name: 'ollama',
        platform: 'darwin',
        homeDir: '/Users/ada',
        exists: () => false,
      }),
    ).toThrow(BinaryNotFoundError);

    try {
      resolveBinary({
        name: 'ollama',
        platform: 'darwin',
        homeDir: '/Users/ada',
        exists: () => false,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryNotFoundError);
      if (error instanceof BinaryNotFoundError) {
        expect(error.message).toContain('ollama');
        expect(error.message).toContain('/opt/homebrew/bin/ollama');
        expect(error.candidates.length).toBeGreaterThan(0);
      }
    }
  });
});
