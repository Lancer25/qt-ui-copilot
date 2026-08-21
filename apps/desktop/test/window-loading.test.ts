import config from '../forge.config';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMainWindowLoadTarget } from '../src/main/window-loading';

describe('desktop build and renderer wiring', () => {
  it('declares Vite entries for main, preload, and the React renderer', () => {
    const vitePlugin = config.plugins?.find((plugin) => (plugin as { name?: string }).name === 'vite');
    expect(vitePlugin).toBeDefined();
    const viteConfig = (vitePlugin as { config: { build: Array<{ entry: string; target: string }>; renderer: Array<{ name: string }> } }).config;
    expect(viteConfig.build).toEqual([
      expect.objectContaining({ entry: 'src/main/main.ts', target: 'main' }),
      expect.objectContaining({ entry: 'src/preload/index.ts', target: 'preload' }),
    ]);
    expect(viteConfig.renderer).toEqual([expect.objectContaining({ name: 'main_window' })]);
    expect(config.makers?.some((maker) => maker.constructor.name === 'MakerSquirrel')).toBe(true);
  });

  it('uses the development server in development and the bundled renderer when packaged', () => {
    expect(resolveMainWindowLoadTarget('http://localhost:5173', 'main_window', 'C:/app/.vite/build'))
      .toEqual({ kind: 'url', value: 'http://localhost:5173' });
    expect(resolveMainWindowLoadTarget(undefined, 'main_window', 'C:/app/.vite/build'))
      .toEqual({ kind: 'file', value: path.join('C:/app/.vite/build', '../renderer/main_window/index.html') });
  });
});
