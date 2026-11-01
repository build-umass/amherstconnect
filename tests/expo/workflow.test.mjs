import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/expo-patches.yml', import.meta.url), 'utf8'));
test('workflow uses only schedule/manual triggers, serialized runs and default-branch trust', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(workflow.on.schedule.length, 1);
  assert.equal(workflow.concurrency.group, 'expo-sdk-patch-updates');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.match(workflow.jobs.prepare.if, /github.event.repository.default_branch/);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});
test('publication is separated, change-gated and restricted to one dev PR and two files', () => {
  const job = workflow.jobs.publish;
  assert.equal(job.needs, 'prepare');assert.match(job.if, /changed == 'true'/);
  const pr = job.steps.find(s => s.uses?.startsWith('peter-evans/create-pull-request@'));
  assert.equal(pr.with.base, 'dev');assert.equal(pr.with.branch, 'chore/expo-sdk-patches');
  assert.equal(pr.with.token, '${{ steps.app.outputs.token }}');
  assert.deepEqual(pr.with['add-paths'].trim().split('\n'), ['apps/mobile/package.json', 'apps/mobile/package-lock.json']);
  const guard = job.steps.findIndex(s => s.run?.startsWith('node scripts/prepare-expo-pr.mjs'));
  const mint = job.steps.findIndex(s => s.id === 'app');assert.ok(guard >= 0 && guard < mint);
  assert.equal(job.steps[mint].with['permission-contents'], 'write');
  assert.equal(job.steps[mint].with['permission-pull-requests'], 'write');
  assert.deepEqual(Object.keys(job.steps[mint].with).filter(k => k.startsWith('permission-')).sort(), ['permission-contents', 'permission-pull-requests']);
  assert.ok(job.steps.every(s => !/npm (ci|install)|eas build|supabase db push|auto-merge/.test(s.run ?? '')));
});
test('workflow pins actions, checks out dev without stored credentials and verifies before artifact upload', () => {
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    const checkout = job.steps.find(s => s.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, 'dev');assert.equal(checkout.with['persist-credentials'], false);
  }
  const steps = workflow.jobs.prepare.steps;
  assert.ok(steps.findIndex(s => s.run === 'npm run verify') < steps.findIndex(s => s.uses?.startsWith('actions/upload-artifact@')));
  assert.equal(steps.find(s => s.id === 'update').run.includes('--base-sha'), true);
});

test('post-verification receipt binds upload and publication independently of report hashes', () => {
  const prepare = workflow.jobs.prepare, steps = prepare.steps;
  const verify = steps.findIndex(s => s.run === 'npm run verify');
  const snapshot = steps.findIndex(s => s.id === 'snapshot');
  const seal = steps.findIndex(s => s.id === 'seal');
  const upload = steps.findIndex(s => s.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(snapshot < verify && verify < seal && seal < upload);
  assert.equal(steps[seal].env.EXPECTED_CANDIDATE_DIGEST, '${{ steps.snapshot.outputs.digest }}');
  assert.equal(prepare.outputs['candidate-digest'], '${{ steps.seal.outputs.digest }}');
  const guard = workflow.jobs.publish.steps.find(s => s.run?.startsWith('node scripts/prepare-expo-pr.mjs'));
  assert.equal(guard.env.VERIFIED_CANDIDATE_DIGEST, '${{ needs.prepare.outputs.candidate-digest }}');
});
