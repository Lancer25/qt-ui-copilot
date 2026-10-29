import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const outputRoot = path.join(workspaceRoot, '.qt-ui-copilot', 'package-assets');
const assets = [
  ['preview-host', path.join(workspaceRoot, 'native', 'qt-ui-preview-host')],
  ['probe', path.join(workspaceRoot, 'native', 'qt-ui-probe')],
  ['component-library', path.join(workspaceRoot, 'resources', 'component-library')],
  ['component-libraries/gtronick-qss', path.join(workspaceRoot, 'resources', 'external-component-libraries', 'gtronick-qss')],
  // The worker is isolated from Electron Main. Its TypeScript source is shipped
  // for the release build pipeline; native UI-TARS dependencies stay outside
  // ASAR through the packager unpack rule.
  ['ui-tars-worker', path.join(workspaceRoot, 'packages', 'ui-tars-worker', 'src')],
];

const digest = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const collectFiles = async (root, relative = '') => {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, next));
    else if (entry.isFile()) files.push(next);
  }
  return files;
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const [name, source] of assets) {
  const destination = path.join(outputRoot, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

const manifestAssets = [];
for (const [name] of assets) {
  for (const relative of await collectFiles(path.join(outputRoot, name))) {
    const entryPath = path.posix.join(name, relative.split(path.sep).join('/'));
    manifestAssets.push({ path: entryPath, sha256: await digest(path.join(outputRoot, name, relative)) });
  }
}
manifestAssets.sort((left, right) => left.path.localeCompare(right.path));
await writeFile(path.join(outputRoot, 'assets-manifest.json'), `${JSON.stringify({ version: 1, assets: manifestAssets }, null, 2)}\n`, 'utf8');
console.log(`Prepared ${manifestAssets.length} checksummed runtime assets in ${outputRoot}`);
