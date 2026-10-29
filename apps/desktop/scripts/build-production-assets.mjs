import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(desktopRoot, '.vite');
const common = { configFile: false, root: desktopRoot, logLevel: 'warn' };
const nodeBuild = (input, entryFileNames) => ({
  ...common,
  // Portable builds do not ship node_modules. Vite externalizes npm packages in
  // SSR builds by default, so explicitly bundle every non-platform dependency.
  // Electron and Node built-ins remain external through Rollup below.
  ssr: { noExternal: true },
  build: {
    ssr: input,
    outDir: path.join(outDir, 'build'),
    emptyOutDir: false,
    target: 'node20',
    rollupOptions: {
      input,
      external: ['electron', /^node:/],
      output: { format: 'cjs', entryFileNames },
    },
  },
});
await build({ ...nodeBuild(path.join(desktopRoot, 'src/main/main.ts'), 'main.js'), define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window') } });
await build(nodeBuild(path.join(desktopRoot, 'src/preload/index.ts'), 'index.js'));
await build({ ...common, root: path.join(desktopRoot, 'src/renderer'), base: './', build: { outDir: path.join(outDir, 'renderer/main_window'), emptyOutDir: true } });
