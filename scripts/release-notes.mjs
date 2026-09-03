#!/usr/bin/env node
/**
 * Print GitHub Release notes for a version from CHANGELOG.md (+ standard footer).
 *
 * Usage: node scripts/release-notes.mjs [version] [outputPath]
 * Version defaults to root package.json (semver without v).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractChangelogSection,
  readRootVersion,
  releaseNotesFooter,
  repoRoot,
} from './release-lib.mjs';

const version = (process.argv[2] ?? readRootVersion()).replace(/^v/, '');
const outPath = process.argv[3];
const changelogPath = join(repoRoot, 'CHANGELOG.md');
let body;
try {
  const changelog = readFileSync(changelogPath, 'utf8');
  body = extractChangelogSection(changelog, version);
} catch {
  body = null;
}

if (!body) {
  body = `## ${version}\n\nSee the commit history for changes in this release.`;
}

const notes = `${body.trim()}\n${releaseNotesFooter()}`;
if (outPath) {
  writeFileSync(outPath, notes);
} else {
  process.stdout.write(notes);
}
