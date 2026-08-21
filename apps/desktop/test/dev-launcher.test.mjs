import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_HOST, DEV_PORT, RENDERER_NAME, createDevLauncherPlan } from '../scripts/dev-config.mjs';

describe('development launcher plan', () => {
  it('starts a loopback-only renderer and defines the matching main-process globals', () => {
    const plan = createDevLauncherPlan('/workspace/apps/desktop');

    expect(plan.rendererServer.server).toEqual({ host: DEV_HOST, port: DEV_PORT, strictPort: true });
    expect(plan.rendererUrl).toBe('http://127.0.0.1:5173');
    expect(plan.mainBuild.define).toEqual({
      MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(plan.rendererUrl),
      MAIN_WINDOW_VITE_NAME: JSON.stringify(RENDERER_NAME),
    });
  });

  it('builds main and preload into the exact paths used by the Electron entry point', () => {
    const plan = createDevLauncherPlan('/workspace/apps/desktop');

    expect(plan.mainBuild.build).toMatchObject({
      outDir: path.join('/workspace/apps/desktop', '.vite', 'build'),
      emptyOutDir: true,
      lib: { fileName: 'main' },
    });
    expect(plan.preloadBuild.build).toMatchObject({
      outDir: path.join('/workspace/apps/desktop', '.vite', 'build'),
      emptyOutDir: false,
      lib: { fileName: 'index' },
    });
  });
});
