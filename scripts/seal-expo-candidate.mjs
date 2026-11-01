import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealVerifiedCandidate } from './expo/candidate-integrity.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Expected the verified candidate directory');
    const digest = sealVerifiedCandidate(resolve(process.argv[2]), resolve('apps/mobile'), process.env.EXPECTED_CANDIDATE_DIGEST);
    assert.ok(process.env.GITHUB_OUTPUT, 'Expected a workflow output channel');
    appendFileSync(process.env.GITHUB_OUTPUT, `digest=${digest}\n`);
    console.log('Candidate matches the workspace package files and required verification snapshot.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
