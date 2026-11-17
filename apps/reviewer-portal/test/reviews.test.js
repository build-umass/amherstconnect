import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureReviews, createReviewerAccess } from '../src/reviews.js';
import { isPublicClientKey } from '../src/config.js';

test('guests, non-reviewers and failed permission checks cannot open the queue', async () => {
  let result = false;
  let state;
  let stores = 0;
  const access = createReviewerAccess({
    checkReviewer: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    createReviews: () => { stores++; return createFixtureReviews(); },
    render: next => { state = next; },
  });
  await access.sessionChanged(null);
  assert.deepEqual(state, { view: 'sign-in' });
  await access.sessionChanged('organizer');
  assert.deepEqual(state, { view: 'denied' });
  result = Error('Unavailable');
  await access.sessionChanged('reviewer');
  assert.deepEqual(state, { view: 'error' });
  assert.equal(stores, 0);
  result = true;
  await access.sessionChanged('reviewer');
  assert.equal(state.view, 'review');
  const permitted = state;
  await access.sessionChanged(null);
  assert.equal(access.isCurrent(permitted), false);
});

test('a late permission check cannot reveal the queue after switching accounts', async () => {
  let allowEarlier;
  let calls = 0;
  let state;
  const access = createReviewerAccess({
    checkReviewer: () => ++calls === 1 ? new Promise(resolve => { allowEarlier = resolve; }) : false,
    render: next => { state = next; },
  });
  const previous = access.sessionChanged('old-reviewer');
  await access.sessionChanged('new-organizer');
  allowEarlier(true);
  await previous;
  assert.deepEqual(state, { view: 'denied' });
});

test('a reviewer can approve and reject fixtures without rewriting a decision', async () => {
  let state;
  const access = createReviewerAccess({ checkReviewer: async () => true, render: next => { state = next; } });
  await access.sessionChanged('reviewer');
  const [first, second] = state.reviews.list();
  state.reviews.decide(first.id, 'approved');
  assert.equal(state.reviews.get(first.id).status, 'approved');
  assert.throws(() => state.reviews.decide(first.id, 'rejected', 'Already reviewed'), /pending/);
  assert.throws(() => state.reviews.decide(second.id, 'rejected', ' '), /reason/);
  state.reviews.decide(second.id, 'rejected', '  Affiliation needs verification. ');
  assert.equal(state.reviews.get(second.id).rejectionReason, 'Affiliation needs verification.');
  await access.sessionChanged(null);
  await access.sessionChanged('reviewer');
  assert.equal(state.reviews.get(first.id).status, 'pending');
});

test('accepts public Supabase keys and rejects privileged or malformed keys', () => {
  const jwt = role => 'fixture.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.fixture';
  assert.equal(isPublicClientKey('sb_publishable_fixture'), true);
  assert.equal(isPublicClientKey(jwt('anon')), true);
  for (const value of [undefined, 'sb_secret_fixture', jwt('service_role'), 'invalid', 'sb_publishable_']) {
    assert.equal(isPublicClientKey(value), false);
  }
});

test('reviewed applications leave the pending queue and remain available by status', () => {
  const reviews = createFixtureReviews();
  const [first, second] = reviews.list('pending');
  reviews.decide(first.id, 'approved');
  assert.deepEqual(reviews.list('pending').map(record => record.id), [second.id]);
  reviews.decide(second.id, 'rejected', 'Affiliation needs verification.');
  assert.deepEqual(reviews.list('pending'), []);
  assert.deepEqual(reviews.list('approved').map(record => record.id), [first.id]);
  assert.deepEqual(reviews.list('rejected').map(record => record.id), [second.id]);
  assert.equal(reviews.list().length, 2);
});
