// Local Supabase integration coverage for E07 bookmarks. Run from the repo root
// after `supabase db reset`, or through `npm run supabase:verify`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';
import { createBookmarkRepository } from '../src/services/bookmarkRepository.ts';

const PASSWORD = 'password123';

function clientFor(connection) {
  return createClient(connection.API_URL, connection.PUBLISHABLE_KEY ?? connection.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signIn(client, email) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  assert.ok(data.user, `expected seeded user ${email} to sign in`);
  return data.user;
}

test('E07 bookmarks save idempotently, unsave, and remain private between users', async () => {
  const connection = localConnection();
  const aliceClient = clientFor(connection);
  const bobClient = clientFor(connection);
  let aliceBookmarksRepository;
  let eventId;
  try {
    const alice = await signIn(aliceClient, 'seed.student1@example.test');
    const bob = await signIn(bobClient, 'seed.student2@example.test');

    const [{ data: events, error: eventsError }, aliceBookmarks, bobBookmarks] = await Promise.all([
      aliceClient.from('events').select('id').eq('status', 'published').eq('visibility', 'public'),
      aliceClient.from('bookmarks').select('event_id'),
      bobClient.from('bookmarks').select('event_id'),
    ]);
    if (eventsError) throw eventsError;
    if (aliceBookmarks.error) throw aliceBookmarks.error;
    if (bobBookmarks.error) throw bobBookmarks.error;
    assert.ok(Array.isArray(events) && events.length > 0, 'expected public seeded events');
    const alreadySaved = new Set([
      ...(aliceBookmarks.data ?? []).map(({ event_id }) => event_id),
      ...(bobBookmarks.data ?? []).map(({ event_id }) => event_id),
    ]);
    const event = events.find(({ id }) => !alreadySaved.has(id));
    assert.ok(event, 'expected a seeded public event not already bookmarked by either test user');

    aliceBookmarksRepository = createBookmarkRepository(aliceClient);
    const bobBookmarksRepository = createBookmarkRepository(bobClient);
    eventId = event.id;

    await aliceBookmarksRepository.save(event.id);
    await aliceBookmarksRepository.save(event.id);
    const { count, error: countError } = await aliceClient
      .from('bookmarks')
      .select('event_id', { count: 'exact', head: true })
      .eq('profile_id', alice.id)
      .eq('event_id', event.id);
    if (countError) throw countError;
    assert.equal(count, 1, 'saving twice must leave exactly one bookmark row');
    assert.equal(await aliceBookmarksRepository.isSaved(event.id), true);

    const hiddenRead = await bobClient
      .from('bookmarks')
      .select('profile_id,event_id')
      .eq('profile_id', alice.id)
      .eq('event_id', event.id);
    assert.equal(hiddenRead.error, null);
    assert.deepEqual(hiddenRead.data, [], 'another user must not read Alice’s bookmark');

    const hiddenDelete = await bobClient
      .from('bookmarks')
      .delete()
      .eq('profile_id', alice.id)
      .eq('event_id', event.id)
      .select('event_id');
    assert.equal(hiddenDelete.error, null);
    assert.deepEqual(hiddenDelete.data, [], 'another user must not delete Alice’s bookmark');
    assert.equal(await aliceBookmarksRepository.isSaved(event.id), true);

    const deniedInsert = await bobClient.from('bookmarks').insert({
      profile_id: alice.id,
      event_id: event.id,
    });
    assert.equal(deniedInsert.error?.code, '42501', 'another user must not create a bookmark for Alice');

    await aliceBookmarksRepository.remove(event.id);
    eventId = undefined;
    assert.equal(await aliceBookmarksRepository.isSaved(event.id), false, 'unsaving must remove the row');
    assert.equal(
      (await aliceBookmarksRepository.list()).some(({ eventId }) => eventId === event.id),
      false,
      'unsaved event must be absent from the saved-events repository result',
    );
    await aliceBookmarksRepository.remove(event.id);
    assert.equal(await aliceBookmarksRepository.isSaved(event.id), false, 'repeated unsave stays successful');
  } finally {
    if (eventId && aliceBookmarksRepository) {
      await aliceBookmarksRepository.remove(eventId).catch(() => {});
    }
    await Promise.allSettled([aliceClient.auth.signOut(), bobClient.auth.signOut()]);
    aliceClient.auth.stopAutoRefresh();
    bobClient.auth.stopAutoRefresh();
  }
});
