import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// TypeScript is already a mobile dev dependency; compile this isolated module
// in memory so the tests run on the project's Node 20+ toolchain.
const source = readFileSync(new URL('../src/services/profileRepository.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createProfileRepository, ProfileRepositoryError } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CREATED_AT = '2026-10-26T12:00:00Z';

function profileRow(id = ALICE, overrides = {}) {
  return {
    id,
    display_name: 'Alice',
    avatar_url: null,
    role: 'student',
    interests: [],
    notify_new_events: true,
    notify_saved_reminders: true,
    onboarding_complete: false,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function fakeClient(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.id, row]));
  const calls = [];
  const state = {
    userId: ALICE,
    authError: null,
    readError: null,
    insertError: null,
    updateError: null,
  };

  const client = {
    auth: {
      async getUser() {
        calls.push({ operation: 'getUser' });
        return { data: { user: state.userId ? { id: state.userId } : null }, error: state.authError };
      },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(columns) {
          assert.match(columns, /notify_saved_reminders/);
          return {
            eq(column, id) {
              calls.push({ operation: 'read', column, id });
              return {
                async maybeSingle() {
                  return { data: rows.get(id) ?? null, error: state.readError };
                },
              };
            },
          };
        },
        insert(values) {
          calls.push({ operation: 'insert', values });
          return {
            select() {
              return {
                async single() {
                  if (state.insertError) return { data: null, error: state.insertError };
                  if (rows.has(values.id)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                  }
                  const row = profileRow(values.id, {
                    display_name: values.display_name,
                    avatar_url: values.avatar_url,
                    role: values.role,
                    onboarding_complete: values.onboarding_complete,
                  });
                  rows.set(values.id, row);
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        update(values) {
          return {
            eq(column, id) {
              calls.push({ operation: 'update', column, id, values });
              return {
                select() {
                  return {
                    async maybeSingle() {
                      if (state.updateError) return { data: null, error: state.updateError };
                      const existing = rows.get(id);
                      if (!existing) return { data: null, error: null };
                      const updated = { ...existing, ...values };
                      rows.set(id, updated);
                      return { data: updated, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, state, rows, calls };
}

// Loads only signed-in profile.
test('load maps a profile and filters by the signed-in user', async () => {
  const fake = fakeClient([profileRow(ALICE, { interests: ['Dining'], notify_new_events: false })]);
  const profile = await createProfileRepository(fake.client).load();

  assert.equal(profile.id, ALICE);
  assert.deepEqual(profile.interests, ['Dining']);
  assert.deepEqual(profile.notificationPrefs, { newEvents: false, savedReminders: true });
  assert.deepEqual(fake.calls.at(-1), { operation: 'read', column: 'id', id: ALICE });
});

// Separates absence from failure.
test('load distinguishes a missing profile from a query failure', async () => {
  const fake = fakeClient();
  const repository = createProfileRepository(fake.client);
  assert.equal(await repository.load(), null);

  fake.state.readError = { code: '42501', message: 'denied' };
  await assert.rejects(repository.load(), (error) =>
    error instanceof ProfileRepositoryError && error.kind === 'query' && error.code === '42501');
});

// Creates profile for session.
test('create uses the authenticated UUID and starts incomplete', async () => {
  const fake = fakeClient();
  const profile = await createProfileRepository(fake.client).create({
    id: BOB, // Unexpected runtime input must never override the session ID.
    displayName: ' Alice ',
    role: 'student',
  });

  assert.equal(profile.id, ALICE);
  assert.equal(profile.displayName, 'Alice');
  assert.equal(profile.onboardingComplete, false);
  assert.equal(fake.calls.find((call) => call.operation === 'insert').values.id, ALICE);
});

// Recovers duplicate profile creation.
test('create recovers a duplicate insert by reading the existing profile', async () => {
  const fake = fakeClient([profileRow(ALICE)]);
  const profile = await createProfileRepository(fake.client).create({ displayName: 'Alice', role: 'student' });

  assert.equal(profile.id, ALICE);
  assert.deepEqual(fake.calls.map((call) => call.operation), ['getUser', 'insert', 'read']);
});

// Persists onboarding interests atomically.
test('completeOnboarding saves interests and completion together', async () => {
  const fake = fakeClient([profileRow()]);
  const profile = await createProfileRepository(fake.client).completeOnboarding([' Dining ', 'Dining', 'Music']);

  assert.deepEqual(profile.interests, ['Dining', 'Music']);
  assert.equal(profile.onboardingComplete, true);
  assert.deepEqual(fake.calls.find((call) => call.operation === 'update'), {
    operation: 'update', column: 'id', id: ALICE,
    values: { interests: ['Dining', 'Music'], onboarding_complete: true },
  });
});

// Preserves onboarding after edits.
test('interest edits leave onboarding status unchanged', async () => {
  const fake = fakeClient([profileRow(ALICE, { onboarding_complete: true })]);
  const profile = await createProfileRepository(fake.client).updateInterests(['Sports']);

  assert.equal(profile.onboardingComplete, true);
  assert.deepEqual(fake.calls.find((call) => call.operation === 'update').values, { interests: ['Sports'] });
});

// Updates only requested preference.
test('preference edits update only supplied switches', async () => {
  const fake = fakeClient([profileRow()]);
  const profile = await createProfileRepository(fake.client).updateNotificationPreferences({ newEvents: false });

  assert.deepEqual(profile.notificationPrefs, { newEvents: false, savedReminders: true });
  assert.deepEqual(fake.calls.find((call) => call.operation === 'update').values, { notify_new_events: false });
});

// Distinguishes missing from failures.
test('updates distinguish a missing profile from a database error', async () => {
  const fake = fakeClient();
  const repository = createProfileRepository(fake.client);
  await assert.rejects(repository.updateInterests(['Arts']), (error) =>
    error instanceof ProfileRepositoryError && error.kind === 'not_found');

  fake.state.updateError = { code: '42501', message: 'denied' };
  await assert.rejects(repository.updateInterests(['Arts']), (error) =>
    error instanceof ProfileRepositoryError && error.kind === 'query' && error.code === '42501');
});

// Blocks unauthenticated profile access.
test('unauthenticated calls never query profiles', async () => {
  const fake = fakeClient();
  fake.state.userId = null;
  await assert.rejects(createProfileRepository(fake.client).load(), (error) =>
    error instanceof ProfileRepositoryError && error.kind === 'unauthenticated');
  assert.deepEqual(fake.calls.map((call) => call.operation), ['getUser']);
});

// Rejects malformed database rows.
test('malformed profile rows fail instead of looking missing', async () => {
  const fake = fakeClient([profileRow(ALICE, { notify_new_events: undefined })]);
  await assert.rejects(createProfileRepository(fake.client).load(), (error) =>
    error instanceof ProfileRepositoryError && error.kind === 'invalid_data');
});

// Rejects invalid changes early.
test('invalid preferences and interests are rejected before writes', async () => {
  const fake = fakeClient([profileRow()]);
  const repository = createProfileRepository(fake.client);
  assert.throws(() => repository.updateNotificationPreferences({}), ProfileRepositoryError);
  assert.throws(() => repository.updateNotificationPreferences({ newEvents: undefined }), ProfileRepositoryError);
  assert.throws(() => repository.updateInterests([' ']), ProfileRepositoryError);
  assert.equal(fake.calls.length, 0);
});
