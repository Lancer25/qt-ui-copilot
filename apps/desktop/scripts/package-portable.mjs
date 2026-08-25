import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const electronDist = process.env.ELECTRON_DIST ?? path.join(workspaceRoot, 'node_modules', 'electron', 'dist');
const output = process.env.PORTABLE_OUTPUT ?? path.join(desktopRoot, 'out', 'qt-ui-copilot-portable-win32-x64');
const appRoot = path.join(output, 'resources', 'app');
await mkdir(appRoot, { recursive: true });
await mkdir(path.join(output, 'resources', 'qt-ui-copilot-assets'), { recursive: true });
await cp(electronDist, output, { recursive: true, force: true });
// The raw Electron distribution's default app takes precedence over the
// packaged application when the executable is launched without an app path.
// Remove it so resources/app.asar is the deterministic entry point.
await rm(path.join(output, 'resources', 'default_app.asar'), { force: true });
await cp(path.join(desktopRoot, 'package.json'), path.join(appRoot, 'package.json'), { force: true });
await cp(path.join(desktopRoot, '.vite'), path.join(appRoot, '.vite'), { recursive: true, force: true });
await cp(path.join(workspaceRoot, '.qt-ui-copilot', 'package-assets'), path.join(output, 'resources', 'qt-ui-copilot-assets'), { recursive: true, force: true });
console.log(JSON.stringify({ output, executable: path.join(output, process.platform === 'win32' ? 'electron.exe' : 'electron') }));
