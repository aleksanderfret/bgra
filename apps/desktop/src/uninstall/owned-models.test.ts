import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  huggingfaceRepoToHubDirName,
  ownedHuggingFaceRepos,
  ownedOllamaTags,
} from './owned-models';

const here = dirname(fileURLToPath(import.meta.url));

describe('ownedOllamaTags', () => {
  it('matches the shared allowlist JSON', () => {
    const raw = JSON.parse(readFileSync(join(here, 'owned-models.json'), 'utf8')) as {
      ollamaTags: string[];
    };
    expect(ownedOllamaTags()).toEqual([...raw.ollamaTags].sort((a, b) => a.localeCompare(b)));
  });

  it('does not include a wipe-all sentinel', () => {
    expect(ownedOllamaTags().some((tag) => tag.includes('*'))).toBe(false);
  });
});

describe('ownedHuggingFaceRepos', () => {
  it('matches the shared allowlist JSON', () => {
    const raw = JSON.parse(readFileSync(join(here, 'owned-models.json'), 'utf8')) as {
      huggingfaceRepos: string[];
    };
    expect(ownedHuggingFaceRepos()).toEqual(
      [...raw.huggingfaceRepos].sort((a, b) => a.localeCompare(b)),
    );
  });
});

describe('huggingfaceRepoToHubDirName', () => {
  it('maps org/name to hub folder name', () => {
    expect(huggingfaceRepoToHubDirName('BAAI/bge-reranker-v2-m3')).toBe(
      'models--BAAI--bge-reranker-v2-m3',
    );
  });
});
