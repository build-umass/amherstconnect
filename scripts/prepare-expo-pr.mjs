import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateSdkCandidate, recommendationsFor } from './expo/sdk-policy.mjs';
import { candidateDigest } from './expo/candidate-integrity.mjs';

// Runs on a fresh publisher runner WITHOUT npm install and BEFORE minting a write token.
export function prepareExpoPr(candidate, root = process.cwd(), { expectedDigest, recommendations, getHead = dir => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim() } = {}) {
  assert.match(expectedDigest ?? '', /^[a-f0-9]{64}$/, 'Missing verified candidate receipt');
  assert.equal(candidateDigest(candidate), expectedDigest, 'Artifact differs from the verified candidate receipt');
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const report = read(join(candidate, 'report.json'));
  assert.match(report.baseSha ?? '', /^[a-f0-9]{40}$/);
  const head = getHead(root);
  assert.equal(head, report.baseSha, 'dev advanced during preparation; rerun instead of publishing a stale candidate');
  const mobile = join(root, 'apps/mobile');
  const pkg = read(join(mobile, 'package.json')), lock = read(join(mobile, 'package-lock.json'));
  const nextPkg = read(join(candidate, 'package.json')), nextLock = read(join(candidate, 'package-lock.json'));
  validateSdkCandidate(pkg, lock, nextPkg, nextLock, report.changes, recommendations);
  assert.equal(report.sdk, `${lock.packages['node_modules/expo'].version.split('.')[0]}.0.0`);
  for (const name of ['package.json', 'package-lock.json']) {
    const content = readFileSync(join(candidate, name));
    assert.equal(createHash('sha256').update(content).digest('hex'), report.hashes[name]);
  }
  // Write only after ALL files have passed structural and content checks.
  for (const name of ['package.json', 'package-lock.json']) writeFileSync(join(mobile, name), readFileSync(join(candidate, name)));
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Expected the candidate artifact directory');
    const baseLock = JSON.parse(readFileSync('apps/mobile/package-lock.json', 'utf8'));
    const sdk = `${baseLock.packages['node_modules/expo'].version.split('.')[0]}.0.0`;
    const recommendations = await recommendationsFor(sdk);
    prepareExpoPr(resolve(process.argv[2]), process.cwd(), { expectedDigest: process.env.VERIFIED_CANDIDATE_DIGEST, recommendations });
    console.log('Validated exact manifest/lockfile candidate for publication; no application code executed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
