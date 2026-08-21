import path from 'node:path';

export const DEV_HOST = '127.0.0.1';
export const DEV_PORT = 5173;
export const RENDERER_NAME = 'main_window';

export const createDevLauncherPlan = (desktopDirectory) => {
  const buildDirectory = path.join(desktopDirectory, '.vite', 'build');
  const rendererUrl = `http://${DEV_HOST}:${DEV_PORT}`;

  return {
    buildDirectory,
    rendererUrl,
    rendererServer: {
      configFile: path.join(desktopDirectory, 'vite.renderer.config.ts'),
      server: { host: DEV_HOST, port: DEV_PORT, strictPort: true },
    },
    mainBuild: {
      configFile: path.join(desktopDirectory, 'vite.main.config.ts'),
      define: {
        MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(rendererUrl),
        MAIN_WINDOW_VITE_NAME: JSON.stringify(RENDERER_NAME),
      },
      build: {
        lib: {
          entry: path.join(desktopDirectory, 'src', 'main', 'main.ts'),
          formats: ['cjs'],
          fileName: 'main',
        },
        outDir: buildDirectory,
        emptyOutDir: true,
      },
    },
    preloadBuild: {
      configFile: path.join(desktopDirectory, 'vite.preload.config.ts'),
      build: {
        lib: {
          entry: path.join(desktopDirectory, 'src', 'preload', 'index.ts'),
          formats: ['cjs'],
          fileName: 'index',
        },
        outDir: buildDirectory,
        emptyOutDir: false,
      },
    },
  };
};
