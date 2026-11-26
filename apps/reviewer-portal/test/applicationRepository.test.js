import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationRepository } from '../src/applicationRepository.js';

test('all application operations deny nonreviewers before calling the backend', async () => {
  const fail = () => assert.fail('Unexpected application backend request');
  const repository = createApplicationRepository({
    checkReviewer: async () => false,
    listApplications: fail, readApplication: fail, approveApplication: fail, rejectApplication: fail,
  });
  for (const call of [() => repository.list('pending'), () => repository.read('a'),
    () => repository.approve('a'), () => repository.reject('a', 'Reason')]) {
    await assert.rejects(call, /Reviewer access required/);
  }
});

test('decisions delegate to the backend and subsequent reads reflect backend state', async () => {
  let status = 'pending';
  const repository = createApplicationRepository({
    checkReviewer: async () => true,
    listApplications: filter => status === filter ? [{ id: 'a', status }] : [],
    readApplication: id => ({ id, status }),
    approveApplication: (...args) => {
      assert.deepEqual(args, ['a', 3]);
      status = 'approved';
    },
    rejectApplication: (...args) => {
      assert.deepEqual(args, ['a', 'Reason']);
      status = 'rejected';
    },
  });
  await assert.rejects(repository.reject('a', '  '), /rejection reason/);
  assert.equal((await repository.list('pending')).length, 1);
  await repository.approve('a');
  assert.equal((await repository.read('a')).status, 'approved');
  assert.deepEqual(await repository.list('pending'), []);
  await repository.reject('a', ' Reason ');
  assert.equal((await repository.read('a')).status, 'rejected');
});

test('backend errors propagate without reporting a successful decision', async () => {
  const repository = createApplicationRepository({
    checkReviewer: async () => true,
    approveApplication: async () => { throw new Error('Application already decided'); },
  });
  await assert.rejects(repository.approve('a'), /already decided/);
});
