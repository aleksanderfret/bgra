import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {'major' | 'minor' | 'patch'} BumpKind */

/**
 * @param {string} version
 * @param {BumpKind} kind
 * @returns {string}
 */
export function bumpSemver(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Expected semver X.Y.Z, got: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (kind === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * @param {string} kindArg
 * @returns {BumpKind}
 */
export function parseBumpKind(kindArg) {
  const kind = (kindArg ?? 'patch').toLowerCase();
  if (kind !== 'major' && kind !== 'minor' && kind !== 'patch') {
    throw new Error(`Bump kind must be major|minor|patch, got: ${kindArg}`);
  }
  return kind;
}

/**
 * Paths relative to repo root that carry the product version.
 * @returns {readonly string[]}
 */
export function versionFilePaths() {
  return [
    'package.json',
    'apps/web/package.json',
    'apps/desktop/package.json',
    'packages/api-contract/package.json',
    'services/rag-engine/package.json',
    'services/rag-engine/pyproject.toml',
    'services/rag-engine/rag_engine/__init__.py',
  ];
}

/**
 * @param {string} content
 * @param {string} next
 * @returns {string}
 */
export function replacePackageJsonVersion(content, next) {
  const updated = content.replace(/^(\s*"version"\s*:\s*")([^"]+)(")/m, `$1${next}$3`);
  if (updated === content) {
    throw new Error('Could not find "version" in package.json');
  }
  return updated;
}

/**
 * @param {string} content
 * @param {string} next
 * @returns {string}
 */
export function replacePyprojectVersion(content, next) {
  const updated = content.replace(/^(version\s*=\s*")([^"]+)(")/m, `$1${next}$3`);
  if (updated === content) {
    throw new Error('Could not find version = "..." in pyproject.toml');
  }
  return updated;
}

/**
 * @param {string} content
 * @param {string} next
 * @returns {string}
 */
export function replaceInitVersion(content, next) {
  const updated = content.replace(/^(__version__\s*=\s*")([^"]+)(")/m, `$1${next}$3`);
  if (updated === content) {
    throw new Error('Could not find __version__ in __init__.py');
  }
  return updated;
}

/**
 * @param {string} relativePath
 * @param {string} next
 * @param {string} [rootDir]
 */
export function writeVersionInFile(relativePath, next, rootDir = repoRoot) {
  const absolute = join(rootDir, relativePath);
  const content = readFileSync(absolute, 'utf8');
  let updated;
  if (relativePath.endsWith('package.json')) {
    updated = replacePackageJsonVersion(content, next);
  } else if (relativePath.endsWith('pyproject.toml')) {
    updated = replacePyprojectVersion(content, next);
  } else if (relativePath.endsWith('__init__.py')) {
    updated = replaceInitVersion(content, next);
  } else {
    throw new Error(`Unknown version file: ${relativePath}`);
  }
  writeFileSync(absolute, updated);
}

/**
 * @param {string} rootDir
 * @returns {string}
 */
export function readRootVersion(rootDir = repoRoot) {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string') {
    throw new Error('Root package.json has no version string');
  }
  return pkg.version;
}

/**
 * Extract a version section from CHANGELOG.md.
 * Accepts headings like `## [0.2.0] - 2026-01-01` or `## 0.2.0`.
 *
 * @param {string} changelog
 * @param {string} version semver without leading v
 * @returns {string | null}
 */
export function extractChangelogSection(changelog, version) {
  const escaped = version.replace(/\./g, '\\.');
  const heading = new RegExp(
    `^##\\s+(?:\\[${escaped}\\]|${escaped})(?:\\s+[—–-]\\s+\\S+)?\\s*$`,
    'm',
  );
  const match = heading.exec(changelog);
  if (!match || match.index === undefined) {
    return null;
  }
  const start = match.index;
  const after = changelog.slice(start + match[0].length);
  const nextHeading = /^##\s+/m.exec(after);
  const body = nextHeading ? after.slice(0, nextHeading.index) : after;
  return `${match[0].trim()}\n${body.trimEnd()}`.trim();
}

/**
 * Footer appended to GitHub Release notes.
 * @returns {string}
 */
export function releaseNotesFooter() {
  return [
    '',
    '---',
    '',
    '**Requirements:** install [uv](https://docs.astral.sh/uv/) and [Ollama](https://ollama.com/) on the machine before opening the app. Models are downloaded locally; they are not inside this package.',
    '',
    '**macOS (Apple Silicon / arm64, unsigned):** right-click the app → Open (Gatekeeper). Intel Macs are not covered by this build.',
    '',
  ].join('\n');
}
