import { build, createServer, type ViteDevServer } from 'vite';
import path from 'node:path';
import { createDevLauncherPlan } from '../../apps/desktop/scripts/dev-config.mjs';

const desktopRoot = path.resolve(import.meta.dirname, '..', '..', 'apps', 'desktop');
const testPort = 5189;

/** Starts the same Vite/main/preload pipeline as the interactive dev launcher. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const plan = createDevLauncherPlan(desktopRoot, testPort);
  const renderer: ViteDevServer = await createServer(plan.rendererServer);
  await renderer.listen();
  try {
    await build(plan.mainBuild);
    await build(plan.preloadBuild);
    const response = await fetch(plan.rendererUrl);
    if (response.status !== 200) throw new Error(`E2E renderer returned HTTP ${response.status}`);
  } catch (error) {
    await renderer.close();
    throw error;
  }
  return async () => { await renderer.close(); };
}
