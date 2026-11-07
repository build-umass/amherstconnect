import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarkRepository } from '../src/services/bookmarkRepository.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = 'e0000000-0000-4000-8000-000000000001';

/** Builds a mock authenticated session. */
function auth(userId = USER_ID, error = null) {
  return { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error }) };
}

/** Verifies authenticated bookmark insertion. */
test('save uses the authenticated profile and event IDs', async () => {
  let inserted;
  const client = {
    auth: auth(),
    /** Builds the bookmark insert query. */
    from(table) {
      assert.equal(table, 'bookmarks');
      return {
        /** Captures the inserted bookmark row. */
        async insert(value) {
          inserted = value;
          return { error: null };
        },
      };
    },
  };

  await createBookmarkRepository(client).save(EVENT_ID);
  assert.deepEqual(inserted, { profile_id: USER_ID, event_id: EVENT_ID });
});

/** Verifies duplicate saves remain successful. */
test('save treats an existing composite key as success', async () => {
  const client = {
    auth: auth(),
    from: () => ({ insert: async () => ({ error: { code: '23505', message: 'duplicate key' } }) }),
  };
  await createBookmarkRepository(client).save(EVENT_ID);
});

/** Verifies deletion ownership filters. */
test('remove scopes deletion to the authenticated profile and event', async () => {
  const filters = [];
  const result = { error: null };
  const builder = {
    /** Collects one deletion filter. */
    eq(column, value) {
      filters.push([column, value]);
      return filters.length === 2 ? Promise.resolve(result) : this;
    },
  };
  const client = { auth: auth(), from: () => ({ delete: () => builder }) };

  await createBookmarkRepository(client).remove(EVENT_ID);
  assert.deepEqual(filters, [['profile_id', USER_ID], ['event_id', EVENT_ID]]);
});

/** Verifies saved-state detection. */
test('isSaved reports whether an owned bookmark exists', async () => {
  /** Builds a state-query test client. */
  function clientFor(data) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data, error: null }),
    };
    return { auth: auth(), from: () => builder };
  }
  assert.equal(await createBookmarkRepository(clientFor({ event_id: EVENT_ID })).isSaved(EVENT_ID), true);
  assert.equal(await createBookmarkRepository(clientFor(null)).isSaved(EVENT_ID), false);
});

/** Verifies ordered bookmark mapping. */
test('list returns valid rows in the order supplied by created_at desc query', async () => {
  let order;
  const rows = [
    { profile_id: USER_ID, event_id: 'new', created_at: '2026-11-02T12:00:00Z', updated_at: '2026-11-02T12:00:00Z' },
    { profile_id: USER_ID, event_id: 'old', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z' },
    { event_id: 'invalid' },
  ];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: async (column, options) => {
      order = [column, options];
      return { data: rows, error: null };
    },
  };

  const bookmarks = await createBookmarkRepository({ auth: auth(), from: () => builder }).list();
  assert.deepEqual(order, ['created_at', { ascending: false }]);
  assert.deepEqual(bookmarks.map(({ eventId }) => eventId), ['new', 'old']);
});

/** Verifies authentication and query errors. */
test('repository rejects signed-out use and reports query failures', async () => {
  const signedOut = { auth: auth(null), from: () => { throw new Error('unexpected query'); } };
  await assert.rejects(createBookmarkRepository(signedOut).save(EVENT_ID), /Sign in to manage bookmarks/);

  const failed = {
    auth: auth(),
    from: () => ({ insert: async () => ({ error: { code: '42501', message: 'permission denied' } }) }),
  };
  await assert.rejects(createBookmarkRepository(failed).save(EVENT_ID), /Could not save event: permission denied/);
});

/** Verifies database codes become actionable messages. */
test('repository explains non-Supabase event IDs and missing rows', async () => {
  /** Builds a client whose insert fails with one database code. */
  function failingInsert(code) {
    return { auth: auth(), from: () => ({ insert: async () => ({ error: { code, message: 'raw' } }) }) };
  }
  await assert.rejects(
    createBookmarkRepository(failingInsert('22P02')).save('1'),
    /Could not save event: this event is not a Supabase event/,
  );
  await assert.rejects(
    createBookmarkRepository(failingInsert('23503')).save(EVENT_ID),
    /Could not save event: the event or your profile no longer exists/,
  );
});
