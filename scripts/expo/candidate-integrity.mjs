import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const candidateFiles = ['body.md', 'package-lock.json', 'package.json', 'report.json'];
export function candidateDigest(candidate) {
  assert.deepEqual(readdirSync(candidate).sort(), candidateFiles);
  const hash = createHash('sha256');
  for (const name of candidateFiles) {
    assert.ok(lstatSync(join(candidate, name)).isFile(), 'Artifact entries must be regular files');
    const bytes = readFileSync(join(candidate, name));
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

// Compare before and after full verification. The final receipt travels as a job output,
// separately from the artifact: rewriting report.json cannot rewrite this receipt.
export function sealVerifiedCandidate(candidate, project, expectedDigest) {
  const digest = candidateDigest(candidate);
  if (expectedDigest !== undefined) assert.equal(digest, expectedDigest, 'Candidate changed during full verification');
  const report = JSON.parse(readFileSync(join(candidate, 'report.json'), 'utf8'));
  for (const name of ['package.json', 'package-lock.json']) {
    const bytes = readFileSync(join(candidate, name));
    assert.ok(bytes.equals(readFileSync(join(project, name))), `Artifact/verified-file mismatch: ${name}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.hashes[name], `Candidate hash mismatch: ${name}`);
  }
  return digest;
}
