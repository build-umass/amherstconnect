import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookmarkEventRepository,
  toBookmarkEvent,
} from '../src/services/bookmarkEvents.ts';

const row = {
  id: 'event-1',
  title: 'Gallery Opening',
  description: 'Student art showcase.',
  is_free: true,
  featured_rank: 1,
  timezone: 'America/New_York',
  organization: { name: 'Fine Arts Center' },
  primary_category: { name: 'Arts & Culture', slug: 'arts-culture' },
  occurrences: [{
    starts_at: '2026-11-03T23:00:00Z',
    all_day: false,
    location_name: null,
    venue: { name: 'Herter Gallery' },
  }],
};

/** Maps joined event display fields. */
test('toBookmarkEvent maps joined Supabase data', () => {
  assert.deepEqual(toBookmarkEvent(row), {
    id: 'event-1',
    title: 'Gallery Opening',
    category: 'Arts & Culture',
    emoji: '🎨',
    date: 'Tue, Nov 3',
    time: '6:00 PM',
    location: 'Herter Gallery',
    organizer: 'Fine Arts Center',
    description: 'Student art showcase.',
    isFree: true,
    isFeatured: true,
  });
});

/** Handles incomplete event relations safely. */
test('toBookmarkEvent supplies display fallbacks', () => {
  const event = toBookmarkEvent({ id: 'event-2', title: 'TBA Event' });
  assert.equal(event.date, 'Date TBA');
  assert.equal(event.time, 'Time TBA');
  assert.equal(event.location, 'Location TBA');
  assert.equal(toBookmarkEvent({ title: 'Missing ID' }), null);
});

/** Queries only requested event identifiers. */
test('repository fetches and maps requested events', async () => {
  let filter;
  const builder = {
    select: () => builder,
    async in(column, values) {
      filter = [column, values];
      return { data: [row], error: null };
    },
  };
  const repository = createBookmarkEventRepository({ from: () => builder });
  const result = await repository.getByIds(['event-1']);
  assert.deepEqual(filter, ['id', ['event-1']]);
  assert.equal(result[0].id, 'event-1');
  assert.equal(repository.getId(result[0]), 'event-1');
});

/** Reports event query failures clearly. */
test('repository exposes bookmarked event query failures', async () => {
  const builder = {
    select: () => builder,
    in: async () => ({ data: null, error: { message: 'permission denied' } }),
  };
  const repository = createBookmarkEventRepository({ from: () => builder });
  await assert.rejects(repository.getByIds(['event-1']), /permission denied/);
});
