import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import semver from 'semver';
import { mobileRoot, checkExpo } from './check-expo.mjs';
import { direct, packageGroups, stableVersion, validateCandidate } from './expo/lock-guard.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
export { recommendationsFor } from './expo/sdk-policy.mjs';
import { fetchJson, recommendationsFor } from './expo/sdk-policy.mjs';

export async function planPatches(manifest, lock, recommendations, versionsFor) {
  const currentExpo = lock.packages['node_modules/expo']?.version;
  stableVersion(currentExpo);
  const changes = [], blocked = [];
  assert.ok(recommendations.expo, 'Expo itself must have a current-SDK recommendation');
  for (const [name, spec] of Object.entries(direct(manifest))) {
    const range = recommendations[name];
    if (!range) continue; // Firebase, Supabase and other unrelated dependencies are untouched.
    const current = lock.packages[`node_modules/${name}`]?.version;
    const [major, minor] = stableVersion(current);
    assert.match(spec, /^[~^]?\d+\.\d+\.\d+$/, `Manual review needed for ${name}'s range`);
    const versions = await versionsFor(name);
    assert.ok(Array.isArray(versions) && versions.length, `Empty registry metadata for ${name}`);
    const candidates = versions.filter(v => semver.valid(v) && !semver.prerelease(v) && semver.major(v) === major && semver.minor(v) === minor && semver.satisfies(v, range));
    const target = semver.maxSatisfying(candidates, '*');
    if (!target || semver.lt(target, current)) {
      blocked.push({ name, current, recommendation: range, reason: 'Would require a non-patch change or downgrade; manual review required' });
    } else if (semver.gt(target, current)) {
      changes.push({ name, from: current, to: target, spec: `${spec.startsWith('~') ? '~' : spec.startsWith('^') ? '^' : ''}${target}` });
    }
  }
  assert.equal(blocked.length, 0, JSON.stringify({ blocked }));
  return { sdk: `${semver.major(currentExpo)}.0.0`, changes };
}

function nativeAt(project, paths) {
  return new Set(paths.filter(path => {
    const dir = join(project, path);
    if (!existsSync(dir)) return false;
    return ['android', 'ios', 'cpp', 'expo-module.config.json', 'react-native.config.js'].some(p => existsSync(join(dir, p)))
      || readdirSync(dir).some(p => p.endsWith('.podspec'))
      || Boolean(read(join(dir, 'package.json')).codegenConfig);
  }));
}
export function bodyFor(report) {
  const table = ['| Package | Locked before | Proposed |', '|---|---|---|', ...report.changes.map(c => `| \`${c.name}\` | ${c.from} | ${c.to} |`)];
  return [
    `Align stable patches within Expo SDK ${report.sdk}. No SDK-major/minor or unrelated direct dependency updates are included.`, '',
    ...table, '',
    report.requiresNativeRebuild
      ? '**Native dependencies changed: rebuild the Android development APK and iOS development app, then verify startup, Metro, login and navigation before merging.**'
      : 'No native package changes were detected. Review the lockfile and runtime implications before merging.',
    ...(report.nativeChanges.length ? [`Native package paths: ${report.nativeChanges.map(n => `\`${n}\``).join(', ')}.`] : []), '',
    'The candidate passed a clean mobile install and locked-SDK compatibility validation. Repository verification runs before publication; normal PR CI must also pass.',
    'This workflow never merges, deploys, or starts EAS builds. A maintainer must review and approve the update.',
  ].join('\n') + '\n';
}

export async function updatePatches({ project = mobileRoot, outputDir, baseSha, fetchImpl = fetch, versionsFor, execute, validate = checkExpo } = {}) {
  const pkgPath = join(project, 'package.json'), lockPath = join(project, 'package-lock.json');
  const pkgText = readFileSync(pkgPath, 'utf8'), lockText = readFileSync(lockPath, 'utf8');
  const manifest = JSON.parse(pkgText), lock = JSON.parse(lockText);
  const sdk = `${semver.major(lock.packages['node_modules/expo'].version)}.0.0`;
  const recommendations = await recommendationsFor(sdk, fetchImpl);
  const available = versionsFor ?? (async name => Object.keys((await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`, fetchImpl)).versions ?? {}));
  const plan = await planPatches(manifest, lock, recommendations, available);
  const report = { baseSha, sdk, changes: plan.changes, requiresNativeRebuild: false, nativeChanges: [] };
  if (!plan.changes.length) return report; // No writes or installs on the no-update path.
  const nativeBefore = nativeAt(project, Object.keys(lock.packages).filter(Boolean));
  const run = execute ?? ((args) => {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: project, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' } });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `npm ${args[0]} failed`);
  });
  try {
    const after = structuredClone(manifest);
    for (const group of packageGroups) for (const c of plan.changes) if (Object.hasOwn(after[group] ?? {}, c.name)) after[group][c.name] = c.spec;
    writeFileSync(pkgPath, JSON.stringify(after, null, 2) + '\n');
    await run(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
    const changedPaths = validateCandidate(manifest, lock, read(pkgPath), read(lockPath), plan.changes);
    await run(['ci', '--no-audit', '--no-fund']);
    await validate(project); // Still runs the actual Expo validator; no validation-disable flags.
    const nativeAfter = nativeAt(project, changedPaths);
    report.nativeChanges = changedPaths.filter(p => nativeBefore.has(p) || nativeAfter.has(p));
    report.requiresNativeRebuild = report.nativeChanges.length > 0;
    if (outputDir) {
      assert.match(baseSha ?? '', /^[a-f0-9]{40}$/);
      mkdirSync(outputDir, { recursive: true });
      report.hashes = {};
      for (const name of ['package.json', 'package-lock.json']) {
        const text = readFileSync(join(project, name), 'utf8');
        writeFileSync(join(outputDir, name), text);
        report.hashes[name] = hash(text);
      }
      writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      writeFileSync(join(outputDir, 'body.md'), bodyFor(report));
    }
    return report;
  } catch (error) {
    writeFileSync(pkgPath, pkgText);
    writeFileSync(lockPath, lockText);
    throw error; // A failed update never leaves a partial manifest/lockfile pair.
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      const key = { '--project': 'project', '--output-dir': 'outputDir', '--base-sha': 'baseSha' }[args[i]];
      assert.ok(key && args[i + 1], 'Expected --project, --output-dir or --base-sha followed by a value');
      options[key] = args[i + 1];
    }
    const report = await updatePatches(options);
    console.log(JSON.stringify(report, null, 2));
    const changed = report.changes.length > 0;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, changed ? bodyFor(report) : `No compatible stable patch updates found for Expo SDK ${report.sdk}; no files changed and no PR will be published.\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
