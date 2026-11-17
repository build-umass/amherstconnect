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
  assert.ok(reviews.list('approved').some(record => record.id === first.id));
  assert.ok(reviews.list('rejected').some(record => record.id === second.id));
  assert.equal(reviews.list().length, 9);
});

test('fixtures link applications, organizers, listings, and audit records', () => {
  const reviews = createFixtureReviews();
  assert.deepEqual(new Set(reviews.list().map(record => record.status)),
    new Set(['pending', 'approved', 'rejected', 'revoked']));
  assert.ok(reviews.organizers().length >= 5);
  assert.ok(reviews.listings().length >= 12);
  assert.equal(new Set(reviews.listings().map(record => record.status)).size, 4);
  for (const organizer of reviews.organizers()) {
    assert.equal(reviews.get(organizer.applicationId).organizerId, organizer.id);
    for (const listing of reviews.listings(organizer.id)) {
      assert.ok(reviews.audit(organizer.id).some(entry => entry.listingId === listing.id));
    }
  }
});

test('approval creates a linked organizer and cap changes are audited', () => {
  const reviews = createFixtureReviews();
  const [application] = reviews.list('pending');
  assert.throws(() => reviews.decide(application.id, 'approved', '', { cap: -1 }), /whole number/);
  assert.equal(reviews.get(application.id).status, 'pending');
  reviews.decide(application.id, 'approved', '', { cap: 0, checks: ['Contact matches the organization'] });
  const organizerId = reviews.get(application.id).organizerId;
  assert.equal(reviews.organizer(organizerId).cap, 0);
  assert.equal(reviews.audit(organizerId)[0].action, 'Approved organizer');
  reviews.setCap(organizerId, 4);
  assert.equal(reviews.organizer(organizerId).cap, 4);
  assert.equal(reviews.audit(organizerId)[0].note, '0 → 4');
});

test('individual and bulk removal are scoped to their listings, and revocation is separate', () => {
  const reviews = createFixtureReviews();
  const organizerId = 'org-film-society';
  const live = reviews.listings(organizerId).filter(record => record.status === 'live');
  const unrelated = reviews.listings('org-coffee');
  assert.throws(() => reviews.removeListing(live[0].id, ''), /reason/);
  reviews.removeListing(live[0].id, 'Individual reason');
  assert.equal(reviews.listing(live[0].id).removalReason, 'Individual reason');
  assert.equal(reviews.listing(live[1].id).status, 'live');
  reviews.removeAll(organizerId, 'Bulk reason');
  assert.deepEqual(reviews.listings(organizerId).map(record => record.status), ['removed', 'withdrawn', 'removed']);
  assert.deepEqual(reviews.listings('org-coffee'), unrelated);
  assert.equal(reviews.organizer(organizerId).status, 'approved');
  assert.throws(() => reviews.revoke(organizerId, ''), /reason/);
  reviews.revoke(organizerId, 'Revocation reason');
  assert.equal(reviews.get('film-society').status, 'revoked');
  assert.deepEqual(reviews.audit(organizerId).slice(0, 3).map(entry => entry.action),
    ['Revoked approval', 'Removed all live listings', 'Removed listing']);
});
