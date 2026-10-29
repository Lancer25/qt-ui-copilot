import { cp, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createWindowsInstaller } from 'electron-winstaller';

const [, , appDirectoryArg, outputDirectoryArg] = process.argv;
if (!appDirectoryArg || !outputDirectoryArg) {
  throw new Error('Usage: node build-squirrel-installer.mjs <portable-app-directory> <output-directory>');
}

const appDirectory = path.resolve(appDirectoryArg);
const outputDirectory = path.resolve(outputDirectoryArg);
const squirrelAppDirectory = `${outputDirectory}-app`;
await rm(outputDirectory, { recursive: true, force: true });
await rm(squirrelAppDirectory, { recursive: true, force: true });

// The portable layout keeps Electron under runtime/ and uses a tiny launcher.
// Squirrel expects the standard Electron layout with the main executable,
// locales and resources at one root, so create a temporary packaging view.
await cp(path.join(appDirectory, 'runtime'), squirrelAppDirectory, { recursive: true, force: true });
await rm(path.join(squirrelAppDirectory, 'resources'), { recursive: true, force: true });
await mkdir(path.join(squirrelAppDirectory, 'resources'), { recursive: true });
await cp(path.join(appDirectory, 'resources'), path.join(squirrelAppDirectory, 'resources'), { recursive: true, force: true });
await rename(path.join(squirrelAppDirectory, 'electron.exe'), path.join(squirrelAppDirectory, 'qt-ui-copilot.exe'));

try {
  await createWindowsInstaller({
    appDirectory: squirrelAppDirectory,
    outputDirectory,
    name: 'qt-ui-copilot',
    title: 'Qt UI Copilot',
    authors: 'Qt UI Copilot',
    owners: 'Qt UI Copilot',
    description: 'AI-assisted Qt Widgets interface development, preview, and project workflow.',
    version: '0.1.0',
    exe: 'qt-ui-copilot.exe',
    setupExe: 'Qt-UI-Copilot-Setup.exe',
    noMsi: true,
    usePackageJson: false,
    ...(process.env.WINDOWS_CERTIFICATE_FILE && process.env.WINDOWS_CERTIFICATE_PASSWORD
      ? { certificateFile: process.env.WINDOWS_CERTIFICATE_FILE, certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD }
      : {}),
  });
} finally {
  await rm(squirrelAppDirectory, { recursive: true, force: true });
}

console.log(`Squirrel.Windows artifacts written to ${outputDirectory}`);
