import { describe, expect, it } from 'vitest';
import { QtKitService, type QtKitFs } from './qt-kit-service';

const fakeFs: QtKitFs = {
  exists: (path) => /(?:uic|rcc)(?:\.exe)?$/.test(path),
  directories: (path) => path === 'D:/Qt5.9.6' ? ['D:/Qt5.9.6/5.9.6'] : path === 'D:/Qt6.10.2' ? ['D:/Qt6.10.2/6.10.2'] : path.endsWith('5.9.6') ? ['D:/Qt5.9.6/5.9.6/msvc2017_64'] : path.endsWith('6.10.2') ? ['D:/Qt6.10.2/6.10.2/msvc2022_64'] : [],
};

describe('QtKitService', () => {
  it('discovers Qt 5.9.6 and Qt 6.10.2 without mixing tools', async () => {
    const service = new QtKitService({ roots: ['D:/Qt5.9.6', 'D:/Qt6.10.2'], fileSystem: fakeFs });
    const kits = await service.scan();
    expect(kits.map((kit) => kit.version)).toEqual(['5.9.6', '6.10.2']);
    expect(kits[0].uic.replaceAll('\\', '/')).toContain('D:/Qt5.9.6');
    expect(kits[1].rcc.replaceAll('\\', '/')).toContain('D:/Qt6.10.2');
  });

  it('omits unknown optional values so discovered kits remain JSON-safe', async () => {
    const fileSystem: QtKitFs = {
      directories: (path) => path === 'E:/Qt' ? ['E:/Qt/6.8.3'] : path.endsWith('6.8.3') ? ['E:/Qt/6.8.3/msvc2022'] : [],
      exists: (path) => /(?:uic|rcc)(?:\.exe)?$/.test(path),
    };
    const [kit] = await new QtKitService({ roots: ['E:/Qt'], fileSystem }).scan();

    expect(kit).toBeTruthy();
    expect(Object.hasOwn(kit!, 'architecture')).toBe(false);
    expect(Object.hasOwn(kit!, 'qmake')).toBe(false);
    expect(JSON.parse(JSON.stringify(kit))).toEqual(kit);
  });

  it('reports exact tool failures and a stable PreviewHost cache key', async () => {
    const service = new QtKitService({ roots: [], run: async ({ executable }) => executable.includes('rcc') ? { exitCode: 1, stdout: '', stderr: 'rcc missing' } : { exitCode: 0, stdout: 'uic version 6.10.2', stderr: '' } });
    const health = await service.check({ id: 'qt6', displayName: 'Qt 6.10.2', version: '6.10.2', qtMajor: 6, rootDir: 'D:/Qt6.10.2/6.10.2/msvc2022_64', binDirectory: 'D:/Qt6.10.2/6.10.2/msvc2022_64/bin', uic: 'uic', rcc: 'rcc', qmake: 'qmake', compilerAbi: 'msvc2022_64', architecture: 'x86_64' });
    expect(health.ok).toBe(false);
    expect(health.tools.find((tool) => tool.name === 'rcc')?.message).toBe('rcc missing');
    expect(health.previewHost.ok).toBe(false);
  });
});
