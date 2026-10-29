import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession, defaultDisplayName } from '../src/services/authSession.ts';

const ALICE = { id: 'alice', email: 'alice@example.com', user_metadata: { display_name: 'Alice' } };
const BOB = { id: 'bob', email: 'bob@example.com', user_metadata: {} };

function profile(id, overrides = {}) {
  return {
    id,
    displayName: 'Alice',
    avatarUrl: null,
    role: 'student',
    interests: [],
    notificationPrefs: { newEvents: true, savedReminders: true },
    onboardingComplete: true,
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    ...overrides,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(loadImpl) {
  let emit;
  const calls = { load: 0, signOut: 0, create: [], complete: [] };
  const profiles = {
    load: async () => { calls.load++; return loadImpl(); },
    create: async (input) => { calls.create.push(input); return profile('alice', { onboardingComplete: false, role: input.role }); },
    completeOnboarding: async (interests) => { calls.complete.push(interests); return profile('alice', { interests }); },
  };
  const session = createAuthSession({
    auth: {
      onAuthStateChange(callback) {
        emit = callback;
        return { data: { subscription: { unsubscribe() { emit = null; } } } };
      },
    },
    profiles,
    signOut: async () => { calls.signOut++; emit?.('SIGNED_OUT', null); },
    defer: (task) => task(),
  });
  const statuses = [];
  session.subscribe(() => statuses.push(session.getSnapshot().status));
  const stop = session.start();
  return { session, emit: (...args) => emit(...args), calls, statuses, stop };
}

test('starts initializing and resolves to signed_out without a stored session', () => {
  const { session, emit } = setup(async () => null);
  assert.equal(session.getSnapshot().status, 'initializing');
  emit('INITIAL_SESSION', null);
  assert.equal(session.getSnapshot().status, 'signed_out');
});

test('restored session with a completed profile goes straight to signed_in', async () => {
  const { session, emit, statuses } = setup(async () => profile('alice'));
  emit('INITIAL_SESSION', { user: ALICE });
  assert.equal(session.getSnapshot().status, 'loading_profile');
  await tick();
  assert.equal(session.getSnapshot().status, 'signed_in');
  assert.equal(session.getSnapshot().user.id, 'alice');
  assert.ok(!statuses.includes('onboarding'), 'never flashes onboarding before the profile loads');
});

test('missing profile routes to onboarding', async () => {
  const { session, emit } = setup(async () => null);
  emit('SIGNED_IN', { user: ALICE });
  await tick();
  assert.equal(session.getSnapshot().status, 'onboarding');
  assert.equal(session.getSnapshot().profile, null);
});

test('incomplete profile continues onboarding with its saved role', async () => {
  const { session, emit } = setup(async () => profile('alice', { onboardingComplete: false, role: 'alumni' }));
  emit('SIGNED_IN', { user: ALICE });
  await tick();
  assert.equal(session.getSnapshot().status, 'onboarding');
  assert.equal(session.getSnapshot().profile.role, 'alumni');
});

test('a database error is profile_error, not onboarding, and keeps the session', async () => {
  let fail = true;
  const { session, emit, calls } = setup(async () => {
    if (fail) throw Object.assign(new Error('boom'), { kind: 'query', code: 'PGRST000' });
    return profile('alice');
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    emit('SIGNED_IN', { user: ALICE });
    await tick();
  } finally {
    console.warn = warn;
  }
  assert.equal(session.getSnapshot().status, 'profile_error');
  assert.ok(session.getSnapshot().profileError);
  assert.equal(session.getSnapshot().user.id, 'alice');
  assert.equal(calls.signOut, 0);

  fail = false;
  await session.retryProfile();
  assert.equal(session.getSnapshot().status, 'signed_in');
});

test('a session the server rejects is signed out', async () => {
  const { session, emit, calls } = setup(async () => {
    throw Object.assign(new Error('gone'), { kind: 'query', code: 'user_not_found' });
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    emit('INITIAL_SESSION', { user: ALICE });
    await tick();
  } finally {
    console.warn = warn;
  }
  assert.equal(calls.signOut, 1);
  assert.equal(session.getSnapshot().status, 'signed_out');
});

test('token refreshes for the same user do not reload the profile', async () => {
  const { session, emit, calls, statuses } = setup(async () => profile('alice'));
  emit('INITIAL_SESSION', { user: ALICE });
  await tick();
  statuses.length = 0;
  emit('TOKEN_REFRESHED', { user: ALICE });
  emit('SIGNED_IN', { user: ALICE });
  await tick();
  assert.equal(calls.load, 1);
  assert.ok(statuses.every((status) => status === 'signed_in'));
});

test('a stale profile load for a previous user is discarded', async () => {
  const pending = deferred();
  let first = true;
  const { session, emit } = setup(() => {
    if (first) { first = false; return pending.promise; }
    return Promise.resolve(profile('bob', { displayName: 'Bob' }));
  });
  emit('SIGNED_IN', { user: ALICE });
  emit('SIGNED_OUT', null);
  emit('SIGNED_IN', { user: BOB });
  await tick();
  pending.resolve(profile('alice'));
  await tick();
  assert.equal(session.getSnapshot().user.id, 'bob');
  assert.equal(session.getSnapshot().profile.id, 'bob');
});

test('sign-out clears the user and profile', async () => {
  const { session, emit } = setup(async () => profile('alice'));
  emit('INITIAL_SESSION', { user: ALICE });
  await tick();
  emit('SIGNED_OUT', null);
  assert.deepEqual(session.getSnapshot(), { status: 'signed_out', user: null, profile: null, profileError: null });
});

test('completeOnboarding creates the profile once, then marks it complete', async () => {
  const { session, emit, calls } = setup(async () => null);
  emit('SIGNED_IN', { user: ALICE });
  await tick();
  await session.completeOnboarding({ role: 'faculty_staff', interests: ['Music'] });
  assert.deepEqual(calls.create, [{ displayName: 'Alice', role: 'faculty_staff' }]);
  assert.deepEqual(calls.complete, [['Music']]);
  assert.equal(session.getSnapshot().status, 'signed_in');
});

test('completeOnboarding reuses an existing incomplete profile', async () => {
  const { session, emit, calls } = setup(async () => profile('alice', { onboardingComplete: false }));
  emit('SIGNED_IN', { user: ALICE });
  await tick();
  await session.completeOnboarding({ role: 'student', interests: [] });
  assert.equal(calls.create.length, 0);
  assert.equal(session.getSnapshot().status, 'signed_in');
});

test('setProfile ignores profiles that belong to another user', async () => {
  const { session, emit } = setup(async () => profile('alice'));
  emit('INITIAL_SESSION', { user: ALICE });
  await tick();
  session.setProfile(profile('bob', { displayName: 'Mallory' }));
  assert.equal(session.getSnapshot().profile.displayName, 'Alice');
  session.setProfile(profile('alice', { interests: ['Tech'] }));
  assert.deepEqual(session.getSnapshot().profile.interests, ['Tech']);
});

test('defaultDisplayName prefers input, then metadata, then the email prefix', () => {
  const user = { id: 'x', email: 'sam@umass.edu', metadataName: null };
  assert.equal(defaultDisplayName(user, ' Sam S '), 'Sam S');
  assert.equal(defaultDisplayName({ ...user, metadataName: 'Samantha' }), 'Samantha');
  assert.equal(defaultDisplayName(user), 'sam');
  assert.equal(defaultDisplayName({ id: 'x', email: null, metadataName: null }), 'User');
  assert.equal(defaultDisplayName(user, 'x'.repeat(150)).length, 100);
});

test('stop unsubscribes from Supabase auth events', () => {
  const { stop, session } = setup(async () => null);
  stop();
  assert.equal(session.getSnapshot().status, 'initializing');
});
