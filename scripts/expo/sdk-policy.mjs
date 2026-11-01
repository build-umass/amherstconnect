import assert from 'node:assert/strict';
import { direct, validateCandidate, stableVersion } from './lock-guard.mjs';

export async function fetchJson(url, fetchImpl = fetch) {
  const accept = new URL(url).hostname === 'registry.npmjs.org' ? 'application/vnd.npm.install-v1+json' : 'application/json';
  const response = await fetchImpl(url, { headers: { accept, 'user-agent': 'amherst-connect-expo-patches/1.0' }, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Metadata request failed: ${new URL(url).hostname} HTTP ${response.status}`);
  return response.json();
}
export async function recommendationsFor(sdk, fetchImpl = fetch) {
  const versions = await fetchJson('https://api.expo.dev/v2/versions/latest', fetchImpl);
  const native = await fetchJson(`https://api.expo.dev/v2/sdks/${sdk}/native-modules`, fetchImpl);
  const version = versions.data?.sdkVersions?.[sdk];
  assert.ok(version?.expoVersion && version.facebookReactVersion && version.facebookReactNativeVersion, `No complete Expo metadata for SDK ${sdk}`);
  assert.ok(Array.isArray(native.data) && native.data.length > 0, 'Missing native compatibility recommendations');
  const result = {};
  for (const row of native.data) {
    assert.ok(typeof row.npmPackage === 'string' && typeof row.versionRange === 'string' && row.versionRange.trim().length > 0, 'Malformed native recommendation');
    result[row.npmPackage] = row.versionRange;
  }
  Object.assign(result, version.relatedPackages, { expo: version.expoVersion, react: version.facebookReactVersion, 'react-dom': version.facebookReactVersion, 'react-native': version.facebookReactNativeVersion });
  for (const range of Object.values(result)) assert.ok(typeof range === 'string' && range.trim().length > 0, 'Malformed SDK recommendation');
  return result;
}


// Deliberately narrow, dependency-free range support on the credential-isolated runner.
// Unknown official range syntax fails closed instead of guessing compatibility.
export function satisfiesSdk(version, range) {
  const v = stableVersion(version);
  const match = /^(~|\^)?(\d+)\.(\d+)\.(\d+)$/.exec(range ?? '');
  assert.ok(match, `Unsupported SDK range; manual review required: ${range}`);
  const r = match.slice(2).map(Number);
  if (!match[1]) return v.every((n, i) => n === r[i]);
  const atLeast = v[0] > r[0] || (v[0] === r[0] && (v[1] > r[1] || (v[1] === r[1] && v[2] >= r[2])));
  if (match[1] === '~') return atLeast && v[0] === r[0] && v[1] === r[1];
  return atLeast && v[0] === r[0] && (r[0] > 0 || (v[1] === r[1] && (r[1] > 0 || v[2] === r[2])));
}

export function validateSdkCandidate(pkg, lock, nextPkg, nextLock, claimed, recommendations) {
  const changes = Object.keys(direct(pkg)).flatMap(name => {
    const from = lock.packages[`node_modules/${name}`]?.version;
    const to = nextLock.packages[`node_modules/${name}`]?.version;
    return from === to ? [] : [{ name, from, to }];
  });
  const normalized = list => list.map(({ name, from, to }) => ({ name, from, to })).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(normalized(claimed), normalized(changes), 'Artifact change list differs from actual package changes');
  for (const { name } of changes) assert.ok(Object.hasOwn(recommendations, name), `Not Expo-managed: ${name}`);
  // Check the entire managed direct set, not just changes asserted in the report.
  for (const name of Object.keys(direct(nextPkg))) if (Object.hasOwn(recommendations, name)) {
    assert.ok(satisfiesSdk(nextLock.packages[`node_modules/${name}`]?.version, recommendations[name]), `SDK-incompatible package: ${name}`);
  }
  return validateCandidate(pkg, lock, nextPkg, nextLock, changes);
}
