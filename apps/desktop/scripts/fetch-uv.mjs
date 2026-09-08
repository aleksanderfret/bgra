/**
 * Download a pinned uv binary into packaging/bin for electron-builder.
 * Usage: node scripts/fetch-uv.mjs [darwin|win32] | --all
 *
 * On macOS the binary is wrapped in BGAUv.app with LSUIElement so spawning it
 * from Electron does not add a black "exec" icon to the Dock.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pin: bump deliberately when packaging needs a newer uv. */
const UV_VERSION = '0.12.10';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'packaging', 'bin');
const DARWIN_APP = 'BGAUv.app';

const ASSETS = {
  darwin: {
    url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-apple-darwin.tar.gz`,
    outName: 'uv',
  },
  win32: {
    url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`,
    outName: 'uv.exe',
  },
};

function platformKey(explicit) {
  if (explicit === 'darwin' || explicit === 'win32') {
    return explicit;
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform;
  }
  throw new Error(`fetch-uv: unsupported platform ${process.platform}`);
}

const GITHUB_ASSET_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

function assertUvDownloadFinalUrl(finalUrl, expectedAssetUrl) {
  let parsed;
  try {
    parsed = new URL(finalUrl);
  } catch {
    throw new Error(`fetch-uv: invalid final URL: ${finalUrl}`);
  }
  if (parsed.protocol !== 'https:' || !GITHUB_ASSET_HOSTS.has(parsed.hostname)) {
    throw new Error(`fetch-uv: refused redirect off allowlist: ${finalUrl}`);
  }
  if (parsed.hostname === 'github.com' && finalUrl.split('?')[0] !== expectedAssetUrl) {
    throw new Error(`fetch-uv: refused unexpected GitHub URL: ${finalUrl}`);
  }
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`fetch-uv: download failed ${response.status} for ${url}`);
  }
  assertUvDownloadFinalUrl(response.url, url);
  return Buffer.from(await response.arrayBuffer());
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`fetch-uv: ${command} ${args.join(' ')} failed`);
  }
}

function wrapDarwinUvApp(binaryPath) {
  const appRoot = join(OUT_DIR, DARWIN_APP);
  const macOsDir = join(appRoot, 'Contents', 'MacOS');
  const wrappedBinary = join(macOsDir, 'uv');
  rmSync(appRoot, { recursive: true, force: true });
  mkdirSync(macOsDir, { recursive: true });
  renameSync(binaryPath, wrappedBinary);
  chmodSync(wrappedBinary, 0o755);
  writeFileSync(
    join(appRoot, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>uv</string>
  <key>CFBundleIdentifier</key>
  <string>local.bga.uv-helper</string>
  <key>CFBundleName</key>
  <string>BGA Runtime</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`,
    'utf8',
  );
  return wrappedBinary;
}

async function fetchOne(platform) {
  const asset = ASSETS[platform];
  const outPath = join(OUT_DIR, asset.outName);
  const darwinWrapped = join(OUT_DIR, DARWIN_APP, 'Contents', 'MacOS', 'uv');
  if (
    platform === 'darwin' &&
    existsSync(darwinWrapped) &&
    process.env.BGA_FORCE_UV_FETCH !== '1'
  ) {
    console.log(`fetch-uv: keeping existing ${darwinWrapped}`);
    return darwinWrapped;
  }
  if (platform !== 'darwin' && existsSync(outPath) && process.env.BGA_FORCE_UV_FETCH !== '1') {
    console.log(`fetch-uv: keeping existing ${outPath}`);
    return outPath;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const work = join(OUT_DIR, `.work-${platform}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  console.log(`fetch-uv: downloading ${asset.url}`);
  const buffer = await download(asset.url);

  if (platform === 'darwin') {
    const archive = join(work, 'uv.tar.gz');
    writeFileSync(archive, buffer);
    run('tar', ['-xzf', archive, '-C', work]);
    const candidates = [join(work, 'uv'), join(work, 'uv-aarch64-apple-darwin', 'uv')];
    const candidate = candidates.find((path) => existsSync(path));
    if (candidate === undefined) {
      throw new Error('fetch-uv: uv binary missing from darwin archive');
    }
    const staged = join(OUT_DIR, 'uv');
    rmSync(staged, { force: true });
    renameSync(candidate, staged);
    chmodSync(staged, 0o755);
    const wrapped = wrapDarwinUvApp(staged);
    rmSync(work, { recursive: true, force: true });
    console.log(`fetch-uv: wrote ${wrapped}`);
    return wrapped;
  }

  const archive = join(work, 'uv.zip');
  writeFileSync(archive, buffer);
  run('tar', ['-xf', archive, '-C', work]);
  const candidates = [join(work, 'uv.exe'), join(work, 'uv-x86_64-pc-windows-msvc', 'uv.exe')];
  const candidate = candidates.find((path) => existsSync(path));
  if (candidate === undefined) {
    throw new Error('fetch-uv: uv.exe missing from windows archive');
  }
  rmSync(outPath, { force: true });
  renameSync(candidate, outPath);
  rmSync(work, { recursive: true, force: true });
  if (!existsSync(outPath)) {
    throw new Error(`fetch-uv: expected ${outPath} after extract`);
  }
  console.log(`fetch-uv: wrote ${outPath}`);
  return outPath;
}

async function main() {
  const args = process.argv.slice(2);
  mkdirSync(OUT_DIR, { recursive: true });
  if (args.includes('--all')) {
    await fetchOne('darwin');
    await fetchOne('win32');
    return;
  }
  await fetchOne(platformKey(args[0]));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
