import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAC_UNINSTALL_APP_NAME = 'BGA Uninstall.app';

/**
 * Visible (Dock) helper that launches BGA with --bga-uninstall.
 * Do not reuse mac_hidden_app — that sets LSUIElement.
 */
export function writeMacUninstallHelperApp(options: {
  destinationDir: string;
  bgaExecPath: string;
  version: string;
}): string {
  const appRoot = join(options.destinationDir, MAC_UNINSTALL_APP_NAME);
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
  <key>CFBundleShortVersionString</key>
  <string>${options.version}</string>
</dict>
</plist>
`,
    'utf8',
  );
  const script = `#!/bin/bash
exec ${JSON.stringify(options.bgaExecPath)} --bga-uninstall "$@"
`;
  const binary = join(macOsDir, 'BGAUninstall');
  writeFileSync(binary, script, { mode: 0o755 });
  chmodSync(binary, 0o755);
  return appRoot;
}

/** Best-effort copy into /Applications — never throws to the caller. */
export function copyMacUninstallHelperToApplications(options: {
  sourceApp: string;
  applicationsDir?: string;
}): { ok: boolean; destination: string } {
  const applicationsDir = options.applicationsDir ?? '/Applications';
  const destination = join(applicationsDir, MAC_UNINSTALL_APP_NAME);
  try {
    if (existsSync(destination)) {
      rmSync(destination, { recursive: true, force: true });
    }
    cpSync(options.sourceApp, destination, { recursive: true });
    return { ok: true, destination };
  } catch {
    return { ok: false, destination };
  }
}
