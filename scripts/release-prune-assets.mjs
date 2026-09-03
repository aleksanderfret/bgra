#!/usr/bin/env node
/**
 * After a successful GitHub Release for a tag, delete assets on every other
 * release so only the newest tag keeps downloadable binaries.
 *
 * Usage: node scripts/release-prune-assets.mjs <tag>
 * Requires gh CLI and GH_TOKEN or GITHUB_TOKEN.
 */
import { spawnSync } from 'node:child_process';

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/release-prune-assets.mjs <tag>  (e.g. v0.1.0)');
  process.exit(1);
}

function ghJson(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout || 'null');
}

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const releases = ghJson(['release', 'list', '--limit', '100', '--json', 'tagName']);

for (const release of releases) {
  if (release.tagName === tag) {
    continue;
  }
  const detail = ghJson(['release', 'view', release.tagName, '--json', 'assets']);
  const assets = detail?.assets ?? [];
  for (const asset of assets) {
    console.log(`Deleting asset ${asset.name} from ${release.tagName}`);
    gh(['release', 'delete-asset', release.tagName, asset.name, '--yes']);
  }
}

console.log(`Pruned assets on releases other than ${tag}.`);
