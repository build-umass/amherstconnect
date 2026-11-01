import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import semver from 'semver';

export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mobile');
const read = path => JSON.parse(readFileSync(path, 'utf8'));

export function checkExpo(projectRoot = mobileRoot, { latest = false } = {}) {
  const pkg = read(join(projectRoot, 'package.json'));
  const lock = read(join(projectRoot, 'package-lock.json'));
  assert.equal(lock.lockfileVersion, 3, 'Expected the committed npm v3 lockfile');
  assert.equal(pkg.expo?.install?.exclude?.length ?? 0, 0, 'Compatibility exclusions require separate review');
  for (const group of ['dependencies', 'devDependencies']) {
    assert.deepEqual(lock.packages[''][group] ?? {}, pkg[group] ?? {}, `${group}: manifest and lockfile differ`);
    for (const [name, range] of Object.entries(pkg[group] ?? {})) {
      const installed = read(join(projectRoot, 'node_modules', name, 'package.json')).version;
      assert.equal(installed, lock.packages[`node_modules/${name}`]?.version, `${name}: installed version differs from lockfile; run npm ci`);
      assert.ok(semver.validRange(range) && semver.satisfies(installed, range), `${name}: installed version violates manifest range`);
    }
  }
  const bundled = read(join(projectRoot, 'node_modules/expo/bundledNativeModules.json'));
  assert.ok(bundled.react && bundled['react-native'], 'Missing Expo bundled compatibility metadata');
  const env = { ...process.env, CI: '1', EXPO_OFFLINE: latest ? '0' : '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1' };
  delete env.EXPO_NO_DEPENDENCY_VALIDATION;
  console.log(latest ? 'Checking live Expo recommendations (network-dependent).' : 'Checking installed versions against the locked Expo SDK compatibility map.');
  const result = spawnSync(process.execPath, [join(projectRoot, 'node_modules/expo/bin/cli'), 'install', '--check'], {
    cwd: projectRoot, env, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Expo compatibility validation failed');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.every(a => a === '--latest'), 'Usage: node scripts/check-expo.mjs [--latest]');
    checkExpo(mobileRoot, { latest: args.includes('--latest') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
