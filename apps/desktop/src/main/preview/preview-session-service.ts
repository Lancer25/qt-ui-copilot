import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { PreviewClient, PreviewHostBuilder, type NativePreviewRequest } from '@qt-ui-copilot/preview-client';
import type { PreviewProfile } from '@qt-ui-copilot/contracts';
import { join, resolve } from 'node:path';

export interface V3PreviewInput { uiFile: string; profile: PreviewProfile; qt: { version: string; compilerAbi: string; architecture: string; binDirectory: string; uic: string; rcc: string; cmake: string; cmakePrefixPath: string; cmakeGenerator?: string }; sourceDirectory: string; cacheDirectory: string; outputImage: string; }
export interface V3PreviewResult { imageDataUrl: string; mode: PreviewProfile['mode']; imagePath: string; findings: unknown[]; degradedFeatures: string[]; confidence: number; }

export class PreviewSessionService {
  private readonly builder = new PreviewHostBuilder();
  private readonly sequences = new Map<string, number>();
  async render(input: V3PreviewInput): Promise<V3PreviewResult> {
    const sequence = (this.sequences.get(input.uiFile) ?? 0) + 1; this.sequences.set(input.uiFile, sequence);
    const host = await this.builder.ensureBuilt({ qtVersion: input.qt.version, compilerAbi: input.qt.compilerAbi, architecture: input.qt.architecture, buildType: 'Debug', operatingSystem: process.platform, cmakeExecutable: input.qt.cmake, cmakePrefixPath: input.qt.cmakePrefixPath, cmakeGenerator: input.qt.cmakeGenerator, sourceDirectory: resolvePreviewHostSource(input.sourceDirectory), cacheDirectory: input.cacheDirectory });
    const request: NativePreviewRequest = { uiFile: input.uiFile, width: input.profile.width, height: input.profile.height, locale: input.profile.locale, style: input.profile.style, qrcFiles: input.profile.mode === 'enhanced' ? input.profile.qrcFiles : [], stylesheets: input.profile.mode === 'enhanced' ? input.profile.stylesheets : [], fonts: input.profile.mode === 'enhanced' ? input.profile.fonts : [], pluginPaths: input.profile.mode === 'enhanced' ? input.profile.pluginPaths : [], rccExecutable: input.qt.rcc, cacheDirectory: input.cacheDirectory, outputImage: input.outputImage };
    const result = await new PreviewClient({ executable: host, qtBinDirectory: input.qt.binDirectory }).render(request);
    if (this.sequences.get(input.uiFile) !== sequence) throw new Error('Preview request superseded');
    if (!result.imagePath) throw new Error('PreviewHost did not return an image path');
    const imageDataUrl = `data:image/png;base64,${(await readFile(result.imagePath)).toString('base64')}`;
    return { imageDataUrl, mode: input.profile.mode, imagePath: result.imagePath, findings: result.findings, degradedFeatures: result.degradedFeatures, confidence: result.degradedFeatures.length ? 0.65 : input.profile.mode === 'enhanced' ? 0.92 : 0.78 };
  }
  cancel(uiFile: string): void { this.sequences.set(uiFile, (this.sequences.get(uiFile) ?? 0) + 1); }
}

/** PreviewHost is an application-owned helper, not a project CMake source. */
export function resolvePreviewHostSource(requested: string): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [requested, resourcesPath ? join(resourcesPath, 'qt-ui-copilot-assets', 'preview-host') : undefined, resolve(process.cwd(), 'native', 'qt-ui-preview-host'), resolve(process.cwd(), '..', '..', 'native', 'qt-ui-preview-host'), resolve(__dirname, '../../../../../native/qt-ui-preview-host')].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => existsSync(join(candidate, 'CMakeLists.txt'))) ?? requested;
}
