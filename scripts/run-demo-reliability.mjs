import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const runsAt = args.indexOf('--runs');
const runs = runsAt >= 0 ? Number(args[runsAt + 1]) : 10;
const fixtureAt = args.indexOf('--fixture');
const fixture = fixtureAt >= 0 ? args[fixtureAt + 1] : 'qt59-app';
if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error('--runs must be an integer from 1 to 100');
if (!['qt59-app', 'qt6-app'].includes(fixture)) throw new Error('--fixture must be qt59-app or qt6-app');

const kitVariable = fixture === 'qt59-app' ? 'QT59_CMAKE_PREFIX_PATH' : 'QT6_CMAKE_PREFIX_PATH';
if (!process.env[kitVariable]) {
  console.error(`[DEMO GATE] ${kitVariable} is required. The reliability result is unavailable rather than fabricated.`);
  process.exit(2);
}

let passed = 0;
const runScript = fixture === 'qt59-app' ? 'test:native:qt59' : 'test:native:qt6';
for (let index = 1; index <= runs; index += 1) {
  console.log(`[DEMO GATE] core run ${index}/${runs}`);
  const result = spawnSync('corepack', ['pnpm@10.15.0', 'run', runScript], { cwd: root, stdio: 'inherit', shell: false, env: process.env });
  if (result.status === 0) passed += 1;
}
const requiredPasses = Math.ceil(runs * 0.9);
console.log(`[DEMO GATE] ${passed}/${runs} core runs passed; need ${requiredPasses}/${runs}.`);
if (passed < requiredPasses) process.exitCode = 1;
if (process.env.QT_UI_COPILOT_UI_TARS_ARRIVALS) {
  const arrivals = Number(process.env.QT_UI_COPILOT_UI_TARS_ARRIVALS);
  if (!Number.isInteger(arrivals) || arrivals < Math.ceil(runs * 0.8)) {
    console.warn(`[DEMO GATE] UI-TARS ${arrivals}/${runs}; retain the experimental label and use semantic/manual navigation for the core demo.`);
  }
}
