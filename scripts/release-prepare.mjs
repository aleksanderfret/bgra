#!/usr/bin/env node
/**
 * Bump product version everywhere it is declared, regenerate CHANGELOG.md via
 * git-cliff, and print the human steps (commit / tag / push). Does not commit.
 *
 * Usage: node scripts/release-prepare.mjs [major|minor|patch]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  bumpSemver,
  parseBumpKind,
  readRootVersion,
  repoRoot,
  versionFilePaths,
  writeVersionInFile,
} from './release-lib.mjs';

const kind = parseBumpKind(process.argv[2]);
const current = readRootVersion();
const next = bumpSemver(current, kind);
const tag = `v${next}`;

for (const relative of versionFilePaths()) {
  writeVersionInFile(relative, next);
}

const cliffBin = join(repoRoot, 'node_modules', '.bin', 'git-cliff');
if (!existsSync(cliffBin)) {
  console.error('git-cliff is not installed. Run pnpm install (devDependency git-cliff).');
  process.exit(1);
}

// Treat commits since the previous v* tag as this release; write the full file.
const cliff = spawnSync(cliffBin, ['--tag', tag, '--output', join(repoRoot, 'CHANGELOG.md')], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (cliff.status !== 0) {
  console.error(cliff.stderr || cliff.stdout || 'git-cliff failed');
  process.exit(cliff.status ?? 1);
}

const files = [...versionFilePaths(), 'CHANGELOG.md'].join(' ');

console.log(`Prepared release ${tag} (was ${current}).`);
console.log('');
console.log('Next steps:');
console.log('  1. pnpm preflight');
console.log(`  2. git add ${files}`);
console.log(
  `  3. git commit -m "chore(repo): release ${tag}" -m "Bump product version and regenerate CHANGELOG."`,
);
console.log(`  4. git tag ${tag}`);
console.log(`  5. git push && git push origin ${tag}`);
console.log('');
console.log('Pushing the tag starts .github/workflows/release.yml (macOS arm64 DMG/zip).');
