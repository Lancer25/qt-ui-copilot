import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const electronDist = process.env.ELECTRON_DIST ?? path.join(workspaceRoot, 'node_modules', 'electron', 'dist');
const output = process.env.PORTABLE_OUTPUT ?? path.join(desktopRoot, 'out', 'qt-ui-copilot-portable-win32-x64');
const appRoot = path.join(output, 'resources', 'app');
const runtimeRoot = path.join(output, 'runtime');
await rm(output, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });
await mkdir(path.join(output, 'resources', 'qt-ui-copilot-assets'), { recursive: true });
await cp(electronDist, runtimeRoot, { recursive: true, force: true });
// The launcher passes resources/app explicitly. Keep the Electron runtime
// unmodified and do not add app.asar: Electron's packaged auto-discovery path
// is not reliable for this offline portable layout.
await rm(path.join(output, 'resources', 'app.asar'), { force: true });
await rm(path.join(output, 'resources', 'default_app.asar'), { force: true });
await cp(path.join(desktopRoot, 'package.json'), path.join(appRoot, 'package.json'), { force: true });
await cp(path.join(desktopRoot, '.vite'), path.join(appRoot, '.vite'), { recursive: true, force: true });
await cp(path.join(workspaceRoot, '.qt-ui-copilot', 'package-assets'), path.join(output, 'resources', 'qt-ui-copilot-assets'), { recursive: true, force: true });
console.log(JSON.stringify({ output, runtime: path.join(runtimeRoot, process.platform === 'win32' ? 'electron.exe' : 'electron'), executable: path.join(output, process.platform === 'win32' ? 'qt-ui-copilot.exe' : 'qt-ui-copilot') }));
