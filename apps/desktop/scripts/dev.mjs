import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, createServer } from 'vite';
import { createDevLauncherPlan, ensureElectronExecutable } from './dev-config.mjs';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const waitForHttpOk = async (url, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
      lastError = new Error(`Renderer returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Renderer did not become ready at ${url}`, { cause: lastError });
};

const run = async () => {
  process.chdir(desktopDirectory);
  const plan = createDevLauncherPlan(desktopDirectory);
  const rendererServer = await createServer(plan.rendererServer);
  let electronProcess;
  let closed = false;

  const close = async (signal) => {
    if (closed) return;
    closed = true;
    if (electronProcess && !electronProcess.killed) electronProcess.kill(signal);
    await rendererServer.close();
  };

  const onSignal = (signal) => {
    void close(signal).finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  };

  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  try {
    await rendererServer.listen();
    await build(plan.mainBuild);
    await build(plan.preloadBuild);
    await waitForHttpOk(plan.rendererUrl);

    const electronExecutable = await ensureElectronExecutable(
      desktopDirectory,
      { overridePath: process.env.ELECTRON_EXECUTABLE_PATH },
    );
    electronProcess = spawn(electronExecutable, ['.'], {
      cwd: desktopDirectory,
      env: process.env,
      stdio: 'inherit',
      windowsHide: false,
    });

    electronProcess.once('exit', async (code) => {
      await close('SIGTERM');
      process.exitCode = code ?? 0;
    });
    electronProcess.once('error', async (error) => {
      console.error('Unable to launch Electron:', error);
      await close('SIGTERM');
      process.exitCode = 1;
    });
  } catch (error) {
    await close('SIGTERM');
    throw error;
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
