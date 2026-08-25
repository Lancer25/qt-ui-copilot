import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
if (process.env.QT_UI_COPILOT_E2E !== '1') {
  console.error('[E2E GATE] Set QT_UI_COPILOT_E2E=1 after configuring a local model endpoint and Qt fixture kits. E2E was not reported as passed.');
  process.exit(2);
}
const desktopRoot = path.join(root, 'apps', 'desktop');
// The workspace installs Playwright at the root (pnpm may not link it into
// the desktop package). Resolve the CLI from this script's module context and
// run Playwright with the repository root as cwd so the root config and tests
// are found consistently on Windows and Linux.
const playwrightCli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const e2eEnvironment = {
  ...process.env,
  // The existing qualified workflow exercises the V2 compatibility path;
  // v3-ide.spec.ts explicitly clears this flag to verify the new default.
  QT_UI_COPILOT_V2: '1',
  // The repository's offline Electron bootstrap may have the extracted
  // runtime but no electron/path.txt. Playwright resolves Electron through
  // the package entry point, so point it at the verified runtime directory.
  ...(process.env.ELECTRON_OVERRIDE_DIST_PATH || !existsSync(path.join(electronDist, 'electron.exe'))
    ? {}
    : { ELECTRON_OVERRIDE_DIST_PATH: electronDist }),
};
const result = spawnSync(process.execPath, [playwrightCli, 'test'], { cwd: root, stdio: 'inherit', shell: false, env: e2eEnvironment });
process.exitCode = result.status ?? 1;
