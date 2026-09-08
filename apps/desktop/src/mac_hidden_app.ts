import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * macOS shows bare CLI binaries (python, uv) as a blinking black "exec" Dock icon.
 * Pointing the spawn at Contents/MacOS inside an LSUIElement .app avoids that.
 *
 * `exec-script` (not a symlink) keeps the venv: Python resolves packages from the
 * real binary path after exec. A symlink to python made site-packages disappear.
 */
export function ensureMacHiddenCliApp(options: {
  userDataDir: string;
  appFileName: string;
  bundleId: string;
  bundleName: string;
  executableName: string;
  targetBinary: string;
  trampoline?: 'symlink' | 'exec-script';
}): string {
  const appRoot = join(options.userDataDir, 'helpers', options.appFileName);
  const macOsDir = join(appRoot, 'Contents', 'MacOS');
  const wrapped = join(macOsDir, options.executableName);
  mkdirSync(macOsDir, { recursive: true });
  writeFileSync(
    join(appRoot, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${options.executableName}</string>
  <key>CFBundleIdentifier</key>
  <string>${options.bundleId}</string>
  <key>CFBundleName</key>
  <string>${options.bundleName}</string>
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
  rmSync(wrapped, { force: true });
  if (options.trampoline === 'exec-script') {
    writeFileSync(wrapped, `#!/bin/bash\nexec ${JSON.stringify(options.targetBinary)} "$@"\n`, {
      mode: 0o755,
    });
  } else {
    symlinkSync(options.targetBinary, wrapped);
  }
  chmodSync(wrapped, 0o755);
  if (!existsSync(wrapped)) {
    throw new Error(`Failed to create hidden helper at ${wrapped}`);
  }
  return wrapped;
}
