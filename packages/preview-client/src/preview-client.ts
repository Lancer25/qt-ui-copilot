import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PreviewRequestSchema, PreviewResultSchema, type PreviewRequest, type PreviewResult } from '@qt-ui-copilot/contracts';

export interface NativePreviewRequest extends PreviewRequest {
  rccExecutable: string;
  cacheDirectory?: string;
  pluginPaths?: string[];
  outputImage?: string;
}

export class PreviewHostError extends Error {
  constructor(message: string, readonly code: 'TIMEOUT' | 'CRASHED' | 'MALFORMED_RESPONSE' | 'HOST_ERROR') { super(message); }
}

export interface PreviewHostCommand {
  executable: string;
  args?: string[];
  /** Exact Qt Kit bin directory used to build this PreviewHost. */
  qtBinDirectory?: string;
  /** Optional target-kit variables, for example QT_PLUGIN_PATH. */
  environment?: NodeJS.ProcessEnv;
}

function previewHostEnvironment(command: PreviewHostCommand): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...command.environment };
  if (!command.qtBinDirectory) return environment;

  // Windows environment variable names are case-insensitive.  Preserve the
  // casing inherited from the launcher so Node does not pass PATH and Path as
  // competing variables to CreateProcess.
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path')
    || (process.platform === 'win32' ? 'Path' : 'PATH');
  const inheritedPath = environment[pathKey];
  environment[pathKey] = inheritedPath
    ? `${command.qtBinDirectory}${path.delimiter}${inheritedPath}`
    : command.qtBinDirectory;
  return environment;
}

export class PreviewClient {
  private readonly command: PreviewHostCommand;
  constructor(command: string | PreviewHostCommand, private readonly timeoutMs = 30_000) {
    this.command = typeof command === 'string' ? { executable: command } : command;
  }

  async render(request: NativePreviewRequest): Promise<PreviewResult> {
    const { rccExecutable, cacheDirectory, pluginPaths, outputImage: requestedOutputImage, ...contractRequest } = request;
    const parsed = PreviewRequestSchema.parse(contractRequest);
    const outputImage = requestedOutputImage || path.join(await mkdtemp(path.join(tmpdir(), 'qt-ui-copilot-preview-')), 'preview.png');
    const payload = { ...parsed, rccExecutable, cacheDirectory, pluginPaths: pluginPaths || [], outputImage };
    return new Promise<PreviewResult>((resolve, reject) => {
      let settled = false; let response = ''; let stderr = '';
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.command.executable, this.command.args || [], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: previewHostEnvironment(this.command),
        });
      }
      catch (error) { reject(new PreviewHostError(String(error), 'CRASHED')); return; }
      const finish = (callback: () => void): void => { if (settled) return; settled = true; clearTimeout(timeout); child.kill(); callback(); };
      const timeout = setTimeout(() => finish(() => reject(new PreviewHostError(`PreviewHost exceeded ${this.timeoutMs}ms`, 'TIMEOUT'))), this.timeoutMs);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { response += chunk; if (response.includes('\n')) finish(() => {
        const line = response.split(/\r?\n/, 1)[0];
        try {
          const nativeResult = JSON.parse(line) as Record<string, unknown>;
          const degradedWidgets = Array.isArray(nativeResult.degradedWidgets) ? nativeResult.degradedWidgets : [];
          const degradedFeatures = [
            ...(Array.isArray(nativeResult.degradedFeatures) ? nativeResult.degradedFeatures : []),
            ...degradedWidgets.map((item) => {
              const widget = item as Record<string, unknown>;
              return `Custom widget ${String(widget.className)} previewed as ${String(widget.fallbackClass)} (${String(widget.objectName)})`;
            }),
          ];
          // The native protocol intentionally includes evidence fields that are
          // richer than the current renderer contract. Keep the public result
          // strict while preserving user-visible degradation evidence.
          const result = PreviewResultSchema.parse({
            success: nativeResult.success,
            imagePath: nativeResult.imagePath,
            error: nativeResult.error,
            findings: nativeResult.findings || [],
            degradedFeatures,
          });
          if (!result.success) reject(new PreviewHostError(result.error || 'PreviewHost reported failure', 'HOST_ERROR'));
          else resolve(result);
        } catch (error) { reject(new PreviewHostError(`Malformed PreviewHost response: ${String(error)}`, 'MALFORMED_RESPONSE')); }
      }); });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.once('error', (error) => finish(() => reject(new PreviewHostError(String(error), 'CRASHED'))));
      child.once('close', (code) => { if (!settled) finish(() => reject(new PreviewHostError(`PreviewHost exited before responding (${code}): ${stderr.trim()}`, 'CRASHED'))); });
      child.stdin.end(`${JSON.stringify(payload)}\n`);
    });
  }
}
