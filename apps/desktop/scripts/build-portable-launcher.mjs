import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';

const run = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(desktopRoot, 'scripts', 'portable-launcher', 'PortableLauncher.csproj');
const output = path.join(desktopRoot, 'out', 'qt-ui-copilot-portable-win32-x64');
const publish = path.join(desktopRoot, '.portable-launcher-publish');
await rm(publish, { recursive: true, force: true });
await run('dotnet', ['publish', project, '-c', 'Release', '-o', publish, '--nologo'], { cwd: desktopRoot });
await rm(path.join(output, 'qt-ui-copilot.exe'), { force: true });
await (await import('node:fs/promises')).copyFile(path.join(publish, 'qt-ui-copilot.exe'), path.join(output, 'qt-ui-copilot.exe'));
await rm(publish, { recursive: true, force: true });
console.log(`Portable launcher written to ${path.join(output, 'qt-ui-copilot.exe')}`);
