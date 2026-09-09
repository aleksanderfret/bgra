/**
 * Write packaging/BGA Uninstall.app for the DMG (points at /Applications/BGA.app).
 * First launch also copies a helper that uses process.execPath.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', 'packaging', 'BGA Uninstall.app');
const macOsDir = join(appRoot, 'Contents', 'MacOS');
mkdirSync(macOsDir, { recursive: true });
writeFileSync(
  join(appRoot, 'Contents', 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>BGAUninstall</string>
  <key>CFBundleIdentifier</key>
  <string>local.bga.uninstall</string>
  <key>CFBundleName</key>
  <string>BGA Uninstall</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
`,
  'utf8',
);
const binary = join(macOsDir, 'BGAUninstall');
writeFileSync(
  binary,
  `#!/bin/bash
exec "/Applications/BGA.app/Contents/MacOS/BGA" --bga-uninstall "$@"
`,
  { mode: 0o755 },
);
chmodSync(binary, 0o755);
console.log(`Wrote ${appRoot}`);
