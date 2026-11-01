import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planPatches, recommendationsFor, updatePatches, bodyFor } from '../../scripts/update-expo-patches.mjs';
import { validateCandidate } from '../../scripts/expo/lock-guard.mjs';
import { prepareExpoPr } from '../../scripts/prepare-expo-pr.mjs';
import { candidateDigest, sealVerifiedCandidate } from '../../scripts/expo/candidate-integrity.mjs';
import { satisfiesSdk } from '../../scripts/expo/sdk-policy.mjs';

const sdk = { expoVersion: '~58.0.22', facebookReactVersion: '19.3.0', facebookReactNativeVersion: '0.88.1', relatedPackages: {} };
const recommendations = { expo: '~58.0.22', 'expo-dev-client': '~58.0.18' };
const versions = async name => name === 'expo' ? ['58.0.21', '58.0.22', '58.0.23-beta.1', '58.1.0', '59.0.0'] : ['58.0.17', '58.0.18', '58.1.0'];
const fetchImpl = async url => ({ ok: true, json: async () => ({ data: url.endsWith('versions/latest') ? { sdkVersions: { '58.0.0': sdk, '59.0.0': { expoVersion: '~59.0.0' } } } : [{ npmPackage: 'expo-dev-client', versionRange: '~58.0.18' }] }) });
const entry = (name, version) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: 'sha512-YQ==' });
function fixture(t, current = false) {
  const root = mkdtempSync(join(tmpdir(), 'expo-updates-')), project = join(root, 'apps/mobile');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(project, { recursive: true });
  const dependencies = { expo: current ? '~58.0.22' : '~58.0.21', 'expo-dev-client': current ? '~58.0.18' : '~58.0.17', firebase: '^12.12.0' };
  const pkg = { name: 'fake-update-fixture', version: '1.0.0', scripts: { verify: 'existing checks' }, dependencies };
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': { dependencies }, 'node_modules/expo': entry('expo', current ? '58.0.22' : '58.0.21'), 'node_modules/expo-dev-client': entry('expo-dev-client', current ? '58.0.18' : '58.0.17'), 'node_modules/firebase': entry('firebase', '12.12.0') } };
  for (const [name, item] of Object.entries(lock.packages)) if (name) {
    mkdirSync(join(project, name), { recursive: true });
    writeFileSync(join(project, name, 'package.json'), JSON.stringify({ version: item.version }));
  }
  mkdirSync(join(project, 'node_modules/expo/ios'));
  writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(join(project, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return { root, project, pkg, lock };
}
function executor(project, calls) {
  return args => {
    calls.push(args);
    if (args[0] === 'install') {
      const pkg = JSON.parse(readFileSync(join(project, 'package.json'))), lock = JSON.parse(readFileSync(join(project, 'package-lock.json')));
      lock.packages[''].dependencies = pkg.dependencies;
      for (const [name, spec] of Object.entries(pkg.dependencies)) lock.packages[`node_modules/${name}`] = entry(name, spec.replace(/^[~^]/, ''));
      writeFileSync(join(project, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    }
  };
}

test('plans only SDK-managed stable patches, never SDK majors/minors or unrelated packages', async t => {
  const { pkg, lock } = fixture(t);
  const plan = await planPatches(pkg, lock, recommendations, versions);
  assert.deepEqual(plan.changes.map(c => [c.name, c.to]), [['expo', '58.0.22'], ['expo-dev-client', '58.0.18']]);
  assert.equal(plan.sdk, '58.0.0');
});
test('required non-patch recommendation and downgrade fail with actionable blocked results', async t => {
  const { pkg, lock } = fixture(t);
  await assert.rejects(planPatches(pkg, lock, { ...recommendations, expo: '^59.0.0' }, versions), /manual review required/);
  await assert.rejects(planPatches(pkg, lock, recommendations, async () => ['58.0.19']), /downgrade/);
  await assert.rejects(planPatches(pkg, lock, { ...recommendations, 'expo-dev-client': '~58.1.0' }, versions), /manual review required/);
});
test('missing/malformed or unreachable official metadata fails closed', async () => {
  await assert.rejects(recommendationsFor('58.0.0', async () => ({ ok: false, status: 503 })), /HTTP 503/);
  await assert.rejects(recommendationsFor('58.0.0', async () => ({ ok: true, json: async () => ({ data: {} }) })), /No complete Expo metadata/);
  await assert.rejects(recommendationsFor('58.0.0', async url => ({ ok: true, json: async () => ({ data: url.endsWith('versions/latest') ? { sdkVersions: { '58.0.0': sdk } } : [{ npmPackage: 'expo', versionRange: false }] }) })), /Malformed/);
});
test('no-update path preserves both files byte-for-byte and performs no install/publication preparation', async t => {
  const f = fixture(t, true), before = ['package.json', 'package-lock.json'].map(n => readFileSync(join(f.project, n), 'utf8'));
  const outputDir = join(f.root, 'candidate');
  const report = await updatePatches({ project: f.project, outputDir, fetchImpl, versionsFor: versions, execute: () => { throw Error('Unexpected install'); } });
  assert.deepEqual(report.changes, []);
  assert.equal(existsSync(outputDir), false);
  assert.deepEqual(['package.json', 'package-lock.json'].map(n => readFileSync(join(f.project, n), 'utf8')), before);
});
test('update path changes both files, validates, flags native changes and prepares only the intended artifact', async t => {
  const f = fixture(t), calls = [];let checked = 0;
  const report = await updatePatches({ project: f.project, outputDir: join(f.root, 'candidate'), baseSha: 'a'.repeat(40), fetchImpl, versionsFor: versions, execute: executor(f.project, calls), validate: () => checked++ });
  assert.equal(report.changes.length, 2);assert.equal(checked, 1);
  assert.deepEqual(calls.map(c => c[0]), ['install', 'ci']);
  assert.ok(calls[0].includes('--ignore-scripts'));assert.ok(!calls.flat().includes('--force'));
  assert.equal(report.requiresNativeRebuild, true);assert.ok(report.nativeChanges.includes('node_modules/expo'));
  assert.match(bodyFor(report), /rebuild the Android development APK and iOS development app/);
  assert.equal(JSON.parse(readFileSync(join(f.project, 'package-lock.json'))).packages['node_modules/firebase'].version, '12.12.0');
});
test('install or compatibility failure restores the exact original pair', async t => {
  for (const failValidation of [false, true]) {
    const f = fixture(t), before = ['package.json', 'package-lock.json'].map(n => readFileSync(join(f.project, n), 'utf8'));
    await assert.rejects(updatePatches({ project: f.project, fetchImpl, versionsFor: versions, execute: failValidation ? executor(f.project, []) : () => { throw Error('Install failed'); }, validate: () => { throw Error('Compatibility failed'); } }), /failed/i);
    assert.deepEqual(['package.json', 'package-lock.json'].map(n => readFileSync(join(f.project, n), 'utf8')), before);
  }
});
test('a JS-only managed patch does not incorrectly require a native rebuild', async t => {
  const f = fixture(t, true), pkg = JSON.parse(readFileSync(join(f.project, 'package.json'))), lock = JSON.parse(readFileSync(join(f.project, 'package-lock.json')));
  pkg.dependencies['@expo/metro-runtime'] = '~58.0.16';lock.packages[''].dependencies = pkg.dependencies;
  lock.packages['node_modules/@expo/metro-runtime'] = entry('@expo/metro-runtime', '58.0.16');
  mkdirSync(join(f.project, 'node_modules/@expo/metro-runtime'), { recursive: true });
  writeFileSync(join(f.project, 'node_modules/@expo/metro-runtime/package.json'), JSON.stringify({ version: '58.0.16' }));
  writeFileSync(join(f.project, 'package.json'), JSON.stringify(pkg));writeFileSync(join(f.project, 'package-lock.json'), JSON.stringify(lock));
  const fetchMetadata = async url => ({ ok: true, json: async () => ({ data: url.endsWith('versions/latest') ? { sdkVersions: { '58.0.0': sdk } } : [{ npmPackage: 'expo-dev-client', versionRange: '~58.0.18' }, { npmPackage: '@expo/metro-runtime', versionRange: '~58.0.17' }] }) });
  const report = await updatePatches({ project: f.project, fetchImpl: fetchMetadata, versionsFor: async name => name === 'expo' ? ['58.0.22'] : name === 'expo-dev-client' ? ['58.0.18'] : ['58.0.16', '58.0.17'], execute: executor(f.project, []), validate: () => {} });
  assert.deepEqual(report.changes.map(c => c.name), ['@expo/metro-runtime']);
  assert.equal(report.requiresNativeRebuild, false);assert.match(bodyFor(report), /No native package changes/);
});
test('scope guard rejects unrelated direct and transitive changes and app-script injection', async t => {
  const f = fixture(t), report = await updatePatches({ project: f.project, fetchImpl, versionsFor: versions, execute: executor(f.project, []), validate: () => {} });
  const pkg = JSON.parse(readFileSync(join(f.project, 'package.json'))), lock = JSON.parse(readFileSync(join(f.project, 'package-lock.json')));
  const changed = structuredClone(lock);changed.packages['node_modules/firebase'].version = '12.12.1';
  assert.throws(() => validateCandidate(f.pkg, f.lock, pkg, changed, report.changes), /Unrelated direct/);
  changed.packages['node_modules/firebase'].version = '12.12.0';changed.packages['node_modules/unrelated'] = entry('unrelated', '1.0.0');
  assert.throws(() => validateCandidate(f.pkg, f.lock, pkg, changed, report.changes), /Unrelated lockfile/);
  const script = structuredClone(pkg);script.scripts.postinstall = 'unexpected code';
  assert.throws(() => validateCandidate(f.pkg, f.lock, script, lock, report.changes), /Only dependency/);
});
test('publisher validates hashes, rejects stale dev and unsafe artifact entries before copying', async t => {
  const f = fixture(t), candidate = join(f.root, 'candidate');
  await updatePatches({ project: f.project, outputDir: candidate, baseSha: 'a'.repeat(40), fetchImpl, versionsFor: versions, execute: executor(f.project, []), validate: () => {} });
  const expectedDigest = sealVerifiedCandidate(candidate, f.project);
  const reset = () => { writeFileSync(join(f.project, 'package.json'), JSON.stringify(f.pkg));writeFileSync(join(f.project, 'package-lock.json'), JSON.stringify(f.lock)); };
  reset();
  assert.throws(() => prepareExpoPr(candidate, f.root, { expectedDigest, recommendations, getHead: () => 'b'.repeat(40) }), /dev advanced/);
  prepareExpoPr(candidate, f.root, { expectedDigest, recommendations, getHead: () => 'a'.repeat(40) });
  reset();writeFileSync(join(candidate, 'package.json'), '{}');
  assert.throws(() => prepareExpoPr(candidate, f.root, { expectedDigest, recommendations, getHead: () => 'a'.repeat(40) }));
  writeFileSync(join(candidate, '.env'), 'not a credential');
  assert.throws(() => prepareExpoPr(candidate, f.root, { expectedDigest, recommendations, getHead: () => 'a'.repeat(40) }));
  rmSync(join(candidate, '.env'));rmSync(join(candidate, 'body.md'));symlinkSync(f.root, join(candidate, 'body.md'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => prepareExpoPr(candidate, f.root, { expectedDigest, recommendations, getHead: () => 'a'.repeat(40) }), /regular files/);
});


async function publicationFixture(t) {
  const f = fixture(t), candidate = join(f.root, 'candidate');
  await updatePatches({ project: f.project, outputDir: candidate, baseSha: 'a'.repeat(40), fetchImpl, versionsFor: versions, execute: executor(f.project, []), validate: () => {} });
  const expectedDigest = sealVerifiedCandidate(candidate, f.project);
  writeFileSync(join(f.project, 'package.json'), JSON.stringify(f.pkg));
  writeFileSync(join(f.project, 'package-lock.json'), JSON.stringify(f.lock));
  return { ...f, candidate, expectedDigest };
}
function rewriteArtifact(f, mutate) {
  const load = name => JSON.parse(readFileSync(join(f.candidate, name)));
  const pkg = load('package.json'), lock = load('package-lock.json'), report = load('report.json');
  mutate(pkg, lock, report);
  for (const [name, value] of [['package.json', pkg], ['package-lock.json', lock]]) {
    const text = JSON.stringify(value);
    writeFileSync(join(f.candidate, name), text);
    report.hashes[name] = createHash('sha256').update(text).digest('hex');
  }
  writeFileSync(join(f.candidate, 'report.json'), JSON.stringify(report));
}
const publisherOptions = f => ({ expectedDigest: f.expectedDigest, recommendations, getHead: () => 'a'.repeat(40) });

test('publisher independently rejects the reproduced incompatible React Native patch', async t => {
  const f = await publicationFixture(t);
  f.pkg.dependencies['react-native'] = '0.88.1';
  f.lock.packages[''].dependencies = f.pkg.dependencies;
  f.lock.packages['node_modules/react-native'] = entry('react-native', '0.88.1');
  writeFileSync(join(f.project, 'package.json'), JSON.stringify(f.pkg));
  writeFileSync(join(f.project, 'package-lock.json'), JSON.stringify(f.lock));
  rewriteArtifact(f, (pkg, lock, report) => {
    pkg.dependencies['react-native'] = '0.88.2';
    lock.packages[''].dependencies = pkg.dependencies;
    lock.packages['node_modules/react-native'] = entry('react-native', '0.88.2');
    report.changes.push({ name: 'react-native', from: '0.88.1', to: '0.88.2' });
  });
  // Even a valid receipt cannot authorize an SDK-incompatible package.
  assert.throws(() => prepareExpoPr(f.candidate, f.root, { ...publisherOptions(f), expectedDigest: candidateDigest(f.candidate), recommendations: { ...recommendations, 'react-native': '0.88.1' } }), /SDK-incompatible package: react-native/);
  assert.equal(JSON.parse(readFileSync(join(f.project, 'package.json'))).dependencies['react-native'], '0.88.1');
});
test('publisher rejects fabricated managed-package membership and altered change lists', async t => {
  const f = await publicationFixture(t);
  rewriteArtifact(f, (pkg, lock, report) => {
    pkg.dependencies.firebase = '^12.12.1';lock.packages[''].dependencies = pkg.dependencies;
    lock.packages['node_modules/firebase'] = entry('firebase', '12.12.1');
    report.changes.push({ name: 'firebase', from: '12.12.0', to: '12.12.1' });
  });
  assert.throws(() => prepareExpoPr(f.candidate, f.root, { ...publisherOptions(f), expectedDigest: candidateDigest(f.candidate) }), /Not Expo-managed: firebase/);
  rewriteArtifact(f, (_pkg, _lock, report) => { report.changes = []; });
  assert.throws(() => prepareExpoPr(f.candidate, f.root, { ...publisherOptions(f), expectedDigest: candidateDigest(f.candidate) }), /change list differs/);
});
test('sealing rejects artifact versus verified-workspace mismatches in either package file', async t => {
  for (const name of ['package.json', 'package-lock.json']) {
    const f = fixture(t), candidate = join(f.root, 'candidate');
    await updatePatches({ project: f.project, outputDir: candidate, baseSha: 'a'.repeat(40), fetchImpl, versionsFor: versions, execute: executor(f.project, []), validate: () => {} });
    writeFileSync(join(f.project, name), readFileSync(join(f.project, name), 'utf8') + ' ');
    assert.throws(() => sealVerifiedCandidate(candidate, f.project), /Artifact\/verified-file mismatch/);
  }
});
test('publisher rejects post-verification artifact changes even with rewritten self-hashes', async t => {
  const f = await publicationFixture(t);
  rewriteArtifact(f, (pkg, lock, report) => {
    pkg.dependencies.expo = '~58.0.23';lock.packages[''].dependencies = pkg.dependencies;
    lock.packages['node_modules/expo'] = entry('expo', '58.0.23');
    report.changes.find(c => c.name === 'expo').to = '58.0.23';
  });
  assert.throws(() => prepareExpoPr(f.candidate, f.root, publisherOptions(f)), /differs from the verified candidate receipt/);
  assert.throws(() => prepareExpoPr(f.candidate, f.root, { ...publisherOptions(f), expectedDigest: undefined }), /Missing verified candidate receipt/);
});
test('dependency-free SDK ranges support exact, tilde and caret rules and fail closed on unknown syntax', () => {
  for (const [version, range, expected] of [['0.88.2', '0.88.1', false], ['58.0.23', '~58.0.22', true], ['58.1.0', '~58.0.22', false], ['1.9.0', '^1.2.3', true], ['0.88.2', '^0.88.1', true], ['0.89.0', '^0.88.1', false], ['0.0.2', '^0.0.1', false]]) assert.equal(satisfiesSdk(version, range), expected);
  assert.throws(() => satisfiesSdk('1.0.0', '>=1'), /Unsupported SDK range/);
});

test('post-verification sealing rejects coordinated changes to artifact and workspace', async t => {
  const f = fixture(t), candidate = join(f.root, 'candidate');
  await updatePatches({ project: f.project, outputDir: candidate, baseSha: 'a'.repeat(40), fetchImpl, versionsFor: versions, execute: executor(f.project, []), validate: () => {} });
  const beforeVerification = sealVerifiedCandidate(candidate, f.project);
  const record = { ...f, candidate };
  rewriteArtifact(record, (_pkg, _lock, report) => { report.requiresNativeRebuild = false; });
  for (const name of ['package.json', 'package-lock.json']) writeFileSync(join(f.project, name), readFileSync(join(candidate, name)));
  assert.throws(() => sealVerifiedCandidate(candidate, f.project, beforeVerification), /Candidate changed during full verification/);
});
