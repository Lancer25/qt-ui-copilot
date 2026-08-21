import path from 'node:path';

export type WindowLoadTarget =
  | { kind: 'url'; value: string }
  | { kind: 'file'; value: string };

export const resolveMainWindowLoadTarget = (
  developmentServerUrl: string | undefined,
  rendererName: string,
  mainDirectory: string,
): WindowLoadTarget => developmentServerUrl
  ? { kind: 'url', value: developmentServerUrl }
  : { kind: 'file', value: path.join(mainDirectory, `../renderer/${rendererName}/index.html`) };

/** The Forge Vite preload entry is src/preload/index.ts, emitted as index.js. */
export const resolvePreloadEntryPath = (mainDirectory: string): string =>
  path.join(mainDirectory, 'index.js');
