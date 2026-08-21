import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
if (process.env.QT_UI_COPILOT_E2E !== '1') {
  console.error('[E2E GATE] Set QT_UI_COPILOT_E2E=1 after configuring a local model endpoint and Qt fixture kits. E2E was not reported as passed.');
  process.exit(2);
}
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { cwd: root, stdio: 'inherit', shell: false, env: process.env });
process.exitCode = result.status ?? 1;
