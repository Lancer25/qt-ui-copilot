import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(desktopRoot, 'out', 'qt-ui-copilot-portable-win32-x64', 'resources');
const asar = path.join(desktopRoot, '..', '..', 'node_modules', '.bin', process.platform === 'win32' ? 'asar.cmd' : 'asar');
await run(asar, ['pack', path.join(appRoot, 'app'), path.join(appRoot, 'app.asar')], { cwd: desktopRoot, shell: process.platform === 'win32' });
const bootstrap = path.join(desktopRoot, 'out', '.portable-bootstrap');
await mkdir(bootstrap, { recursive: true });
await writeFile(path.join(bootstrap, 'package.json'), '{"main":"bootstrap.js"}\n');
await writeFile(path.join(bootstrap, 'bootstrap.js'), "require(require('node:path').join(process.resourcesPath, 'app.asar'));\n");
await run(asar, ['pack', bootstrap, path.join(appRoot, 'default_app.asar')], { cwd: desktopRoot, shell: process.platform === 'win32' });
await rm(bootstrap, { recursive: true, force: true });
console.log(`Packed ${path.join(appRoot, 'app.asar')}`);
