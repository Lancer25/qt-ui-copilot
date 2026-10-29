import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { resolve } from 'node:path';

const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: '**/{@ui-tars,@nut-tree}/**' },
    // Offline qualification runners can point this at a directory containing
    // electron-v40.0.0-win32-x64.zip; CI otherwise uses Electron's cache.
    electronZipDir: process.env.ELECTRON_ZIP_DIR,
    // PreviewHost/Probe are C++11 source assets, built against each target Qt
    // kit. UI-TARS may load native Node modules, so those remain unpacked.
    extraResource: [resolve(__dirname, '../../.qt-ui-copilot/package-assets')],
  },
  makers: [new MakerSquirrel({
    name: 'qt-ui-copilot',
    title: 'Qt UI Copilot',
    authors: 'Qt UI Copilot',
    description: 'AI-assisted Qt Widgets interface development, preview, and project workflow.',
    setupExe: 'Qt-UI-Copilot-Setup.exe',
    noMsi: true,
    ...(certificateFile && certificatePassword ? { certificateFile, certificatePassword } : {}),
  })],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' },
      ],
    }),
  ],
};

export default config;
