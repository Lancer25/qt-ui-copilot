import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = process.argv.includes('--required');
const requested = process.argv.includes('--qt59-only') ? ['qt59'] : process.argv.includes('--qt6-only') ? ['qt6'] : ['qt59', 'qt6'];
const cmake = process.env.CMAKE_EXECUTABLE || 'cmake';
const ctest = path.basename(cmake).toLowerCase().startsWith('cmake')
  ? path.join(path.dirname(cmake), process.platform === 'win32' ? 'ctest.exe' : 'ctest')
  : 'ctest';
const kits = {
  qt59: { label: 'Qt 5.9.6', prefix: process.env.QT59_CMAKE_PREFIX_PATH, fixture: 'fixtures/qt59-app', major: '5' },
  qt6: { label: 'Qt 6.x', prefix: process.env.QT6_CMAKE_PREFIX_PATH, fixture: 'fixtures/qt6-app', major: '6' },
};

const run = (executable, args, prefix) => {
  const kitBin = path.join(prefix, 'bin');
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const inheritedPath = process.env[pathKey] || process.env.PATH || '';
  return spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    // CTest launches native test executables directly. Put the exact Kit's
    // DLL directory first so a host Qt installation cannot mask ABI issues.
    env: { ...process.env, [pathKey]: `${kitBin}${path.delimiter}${inheritedPath}` },
  });
};
const qualifyCmakeProject = (label, source, build, major, prefix, selfContainedTestRuntime = false) => {
  console.log(`[QT GATE] configuring ${label}`);
  const configure = run(cmake, ['-S', source, '-B', build, `-DQT_MAJOR_VERSION=${major}`, `-DCMAKE_PREFIX_PATH=${prefix}`], prefix);
  const compile = configure.status === 0 && run(cmake, ['--build', build, '--config', 'Debug'], prefix);
  // PreviewHost owns its CTest DLL search path.  Keep this invocation clean
  // so qualification catches a missing ENVIRONMENT property.  The separate
  // fixture/probe project has its own runtime policy and still receives Kit
  // variables through the harness.
  const test = compile?.status === 0 && (selfContainedTestRuntime
    ? spawnSync(ctest, ['--test-dir', build, '--output-on-failure', '-C', 'Debug'], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })
    : run(ctest, ['--test-dir', build, '--output-on-failure', '-C', 'Debug'], prefix));
  if (configure.status !== 0 || compile?.status !== 0 || test?.status !== 0) {
    console.error(`[QT GATE] ${label} failed.`);
    return false;
  }
  console.log(`[QT GATE] ${label} passed.`);
  return true;
};

let unavailable = false;
let failed = false;
for (const key of requested) {
  const kit = kits[key];
  if (!kit.prefix || !existsSync(kit.prefix)) {
    unavailable = true;
    console.error(`[QT GATE] ${kit.label} unavailable. Set ${key === 'qt59' ? 'QT59_CMAKE_PREFIX_PATH' : 'QT6_CMAKE_PREFIX_PATH'} to that Kit's CMake prefix; no native success was claimed.`);
    continue;
  }
  console.log(`[QT GATE] ${kit.label} Kit: ${kit.prefix}`);
  const qualificationRoot = path.join(root, '.qt-ui-copilot', 'qualification', key);
  // PreviewHost must be built with exactly the same Kit as the target app:
  // it is not enough to qualify the Fixture/Probe pair alone.
  const previewPassed = qualifyCmakeProject(
    `${kit.label} PreviewHost`,
    path.join(root, 'native', 'qt-ui-preview-host'),
    path.join(qualificationRoot, 'preview-host'),
    kit.major,
    kit.prefix,
    true,
  );
  const fixturePassed = previewPassed && qualifyCmakeProject(
    `${kit.label} Fixture + QtUiProbe`,
    path.join(root, kit.fixture),
    path.join(qualificationRoot, 'fixture'),
    kit.major,
    kit.prefix,
  );
  if (!previewPassed || !fixturePassed) { failed = true; console.error(`[QT GATE] ${kit.label} qualification failed.`); }
  else console.log(`[QT GATE] ${kit.label} qualification passed.`);
}
if (failed || (required && unavailable)) process.exitCode = 1;
else if (unavailable) process.exitCode = 2;
