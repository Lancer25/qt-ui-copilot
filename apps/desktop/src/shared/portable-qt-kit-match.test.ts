import { describe, expect, it } from 'vitest';
import { localQtToolchainFromKit, matchPortableQtKit, portableQtFingerprint } from './portable-qt-kit-match';

const bin = 'D:/Qt/5.9.6/msvc2015_64/bin';
const kit = (overrides: Record<string, unknown> = {}) => ({
  version: '5.9.6', qtMajor: 5 as const, binDirectory: bin, uic: `${bin}/uic.exe`, rcc: `${bin}/rcc.exe`,
  rootDir: 'D:/Qt/5.9.6/msvc2015_64', compilerAbi: 'msvc2015_64', architecture: 'x86_64', ...overrides,
});

describe('portable Qt Kit toolchain', () => {
  it('defaults the tool paths a Kit never stores', () => {
    // Reproduced from a project that was reported as unconfigured although its
    // matching Kit was bound: a saved Kit records the Qt installation, not the
    // CMake that happens to build with it.
    expect(localQtToolchainFromKit(kit())).toEqual({
      version: '5.9.6', binDirectory: bin, uic: `${bin}/uic.exe`, rcc: `${bin}/rcc.exe`,
      compilerAbi: 'msvc2015_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: 'D:/Qt/5.9.6/msvc2015_64',
    });
  });

  it('derives the Kit root from the tool location when nothing else records one', () => {
    const toolchain = localQtToolchainFromKit(kit({ rootDir: undefined, cmakePrefixPath: undefined }));
    expect(toolchain?.cmakePrefixPath).toBe('D:/Qt/5.9.6/msvc2015_64');
    expect(localQtToolchainFromKit({ version: '5.9.6', binDirectory: 'C:\\Qt\\bin', uic: 'C:\\Qt\\bin\\uic.exe', rcc: 'C:\\Qt\\bin\\rcc.exe' })?.cmakePrefixPath).toBe('C:\\Qt');
  });

  it('keeps the paths a Kit does record, including cmake', () => {
    const toolchain = localQtToolchainFromKit(kit({ cmake: 'C:/CMake/bin/cmake.exe', cmakePrefixPath: 'C:/prefix', cmakeGenerator: 'Ninja', compilerAbi: undefined }));
    expect(toolchain).toEqual({ version: '5.9.6', binDirectory: bin, uic: `${bin}/uic.exe`, rcc: `${bin}/rcc.exe`, compilerAbi: 'x86_64', architecture: 'x86_64', cmake: 'C:/CMake/bin/cmake.exe', cmakePrefixPath: 'C:/prefix', cmakeGenerator: 'Ninja' });
  });

  it('refuses a Kit that cannot drive a build', () => {
    expect(localQtToolchainFromKit(undefined)).toBeUndefined();
    expect(localQtToolchainFromKit(kit({ uic: '' }))).toBeUndefined();
    expect(localQtToolchainFromKit(kit({ binDirectory: '  ' }))).toBeUndefined();
  });

  it('still matches only an exact Qt identity', () => {
    expect(matchPortableQtKit({ qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } }, [{ id: 'kit', ...kit() }])).toEqual({ status: 'matched', kit: { id: 'kit', ...kit() } });
    expect(matchPortableQtKit({ qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } }, [{ id: 'kit', ...kit({ architecture: 'x86' }) }])).toEqual({ status: 'binding_required' });
    expect(portableQtFingerprint({ qt: { version: '5.9.6', compilerAbi: 'msvc2015_64' } })).toBeUndefined();
  });
});
