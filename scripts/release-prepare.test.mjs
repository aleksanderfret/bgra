import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bumpSemver,
  extractChangelogSection,
  parseBumpKind,
  releaseNotesFooter,
  replaceInitVersion,
  replacePackageJsonVersion,
  replacePyprojectVersion,
} from './release-lib.mjs';

describe('bumpSemver', () => {
  it('bumps patch by default path', () => {
    assert.equal(bumpSemver('0.1.0', 'patch'), '0.1.1');
  });

  it('bumps minor and resets patch', () => {
    assert.equal(bumpSemver('0.1.3', 'minor'), '0.2.0');
  });

  it('bumps major and resets minor/patch', () => {
    assert.equal(bumpSemver('1.2.3', 'major'), '2.0.0');
  });

  it('rejects non-semver', () => {
    assert.throws(() => bumpSemver('1.0', 'patch'));
  });
});

describe('parseBumpKind', () => {
  it('defaults missing argv to patch via caller', () => {
    assert.equal(parseBumpKind('patch'), 'patch');
    assert.equal(parseBumpKind('MINOR'), 'minor');
  });

  it('rejects unknown kinds', () => {
    assert.throws(() => parseBumpKind('rc'));
  });
});

describe('version file rewriters', () => {
  it('updates package.json version', () => {
    const next = replacePackageJsonVersion(
      '{\n  "name": "x",\n  "version": "0.1.0",\n  "private": true\n}\n',
      '0.2.0',
    );
    assert.match(next, /"version": "0.2.0"/);
  });

  it('updates pyproject.toml version', () => {
    const next = replacePyprojectVersion('name = "rag-engine"\nversion = "0.1.0"\n', '0.1.1');
    assert.equal(next, 'name = "rag-engine"\nversion = "0.1.1"\n');
  });

  it('updates __version__', () => {
    const next = replaceInitVersion('__version__ = "0.1.0"\n', '0.3.0');
    assert.equal(next, '__version__ = "0.3.0"\n');
  });
});

describe('extractChangelogSection', () => {
  const sample = `# Changelog

## [0.2.0] - 2026-09-03

### Features
- **web:** theme switcher

## [0.1.0] - 2026-08-01

- Initial release
`;

  it('extracts a bracketed version section', () => {
    const section = extractChangelogSection(sample, '0.2.0');
    assert.ok(section);
    assert.match(section, /## \[0\.2\.0]/);
    assert.match(section, /theme switcher/);
    assert.doesNotMatch(section, /0\.1\.0/);
  });

  it('returns null when missing', () => {
    assert.equal(extractChangelogSection(sample, '9.9.9'), null);
  });
});

describe('releaseNotesFooter', () => {
  it('mentions uv, Ollama, Gatekeeper and arm64', () => {
    const footer = releaseNotesFooter();
    assert.match(footer, /uv/);
    assert.match(footer, /Ollama/);
    assert.match(footer, /Gatekeeper/);
    assert.match(footer, /arm64/);
  });
});
