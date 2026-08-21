import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = process.argv.includes('--required');
const requested = process.argv.includes('--qt59-only') ? ['qt59'] : process.argv.includes('--qt6-only') ? ['qt6'] : ['qt59', 'qt6'];
const cmake = process.env.CMAKE_EXECUTABLE || 'cmake';
const kits = {
  qt59: { label: 'Qt 5.9.6', prefix: process.env.QT59_CMAKE_PREFIX_PATH, fixture: 'fixtures/qt59-app', major: '5' },
  qt6: { label: 'Qt 6.x', prefix: process.env.QT6_CMAKE_PREFIX_PATH, fixture: 'fixtures/qt6-app', major: '6' },
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
  const build = path.join(root, '.qt-ui-copilot', 'qualification', key);
  const configureArgs = ['-S', path.join(root, kit.fixture), '-B', build, `-DQT_MAJOR_VERSION=${kit.major}`, `-DCMAKE_PREFIX_PATH=${kit.prefix}`];
  console.log(`[QT GATE] configuring ${kit.label} with ${kit.prefix}`);
  const configure = spawnSync(cmake, configureArgs, { cwd: root, stdio: 'inherit', shell: false });
  const compile = configure.status === 0 && spawnSync(cmake, ['--build', build, '--config', 'Debug'], { cwd: root, stdio: 'inherit', shell: false });
  const test = compile?.status === 0 && spawnSync('ctest', ['--test-dir', build, '--output-on-failure'], { cwd: root, stdio: 'inherit', shell: false });
  if (configure.status !== 0 || compile?.status !== 0 || test?.status !== 0) { failed = true; console.error(`[QT GATE] ${kit.label} qualification failed.`); }
  else console.log(`[QT GATE] ${kit.label} qualification passed.`);
}
if (failed || (required && unavailable)) process.exitCode = 1;
else if (unavailable) process.exitCode = 2;
