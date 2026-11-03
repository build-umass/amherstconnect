import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkExpo, mobileRoot } from '../../scripts/check-expo.mjs';
import semver from 'semver';

const bundled = JSON.parse(readFileSync(join(mobileRoot, 'node_modules/expo/bundledNativeModules.json')));
const compatibleScreens = semver.minVersion(bundled['react-native-screens']).version;
const incompatibleScreens = ['999.0.0', '0.0.0'].find(v => !semver.satisfies(v, bundled['react-native-screens']));
assert.ok(incompatibleScreens, 'Expected a version outside the SDK compatibility range');

function fixture(t, { installed = compatibleScreens, locked = installed, requested = installed } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'expo-compat-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const expo = JSON.parse(readFileSync(join(mobileRoot, 'node_modules/expo/package.json'))).version;
  const rn = semver.minVersion(bundled['react-native']).version;
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  symlinkSync(join(mobileRoot, 'node_modules/expo'), join(dir, 'node_modules/expo'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const [name, version] of [['react-native', rn], ['react-native-screens', installed]]) {
    mkdirSync(join(dir, 'node_modules', name));
    writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  }
  const dependencies = { expo: `~${expo}`, 'react-native': rn, 'react-native-screens': requested };
  const pkg = { name: 'compatibility-fixture', version: '1.0.0', private: true, dependencies };
  const lock = { lockfileVersion: 3, packages: { '': { dependencies }, 'node_modules/expo': { version: expo }, 'node_modules/react-native': { version: rn }, 'node_modules/react-native-screens': { version: locked } } };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'Compatibility fixture', slug: 'compatibility-fixture' } }));
  return dir;
}

test('real offline Expo validation accepts a compatible locked dependency set', t => {
  checkExpo(fixture(t));
});
test('installed version drift is rejected before the Expo check', t => {
  assert.throws(() => checkExpo(fixture(t, { installed: incompatibleScreens, locked: compatibleScreens, requested: compatibleScreens })), /differs from lockfile/);
});
test('real Expo validator rejects incompatible installed versions even when manifest and lock agree', t => {
  const previous = process.env.EXPO_NO_DEPENDENCY_VALIDATION;
  process.env.EXPO_NO_DEPENDENCY_VALIDATION = '1';
  try { assert.throws(() => checkExpo(fixture(t, { installed: incompatibleScreens })), /Expo compatibility validation failed/); }
  finally { if (previous === undefined) delete process.env.EXPO_NO_DEPENDENCY_VALIDATION; else process.env.EXPO_NO_DEPENDENCY_VALIDATION = previous; }
});
test('manifest/lock mismatch and exclusion bypasses are rejected', t => {
  const dir = fixture(t), file = join(dir, 'package.json'), pkg = JSON.parse(readFileSync(file));
  pkg.dependencies['react-native-screens'] = incompatibleScreens;
  writeFileSync(file, JSON.stringify(pkg));
  assert.throws(() => checkExpo(dir), /manifest and lockfile differ/);
  pkg.expo = { install: { exclude: ['react-native-screens'] } };
  writeFileSync(file, JSON.stringify(pkg));
  assert.throws(() => checkExpo(dir), /exclusions require separate review/);
});
test('a missing installed package fails rather than silently skipping validation', t => {
  const dir = fixture(t);
  rmSync(join(dir, 'node_modules/react-native-screens'), { recursive: true });
  assert.throws(() => checkExpo(dir), /ENOENT/);
});
