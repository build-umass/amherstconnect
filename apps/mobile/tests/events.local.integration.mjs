// Local Supabase integration coverage for E03: Home and Event Details read the
// seeded events through the E02 repository and turn them into what the
// screens show. Run from the repo root after `supabase db reset`, or through
// `npm run supabase:verify`. Read-only: nothing is written.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';
import { createSupabaseEventRepository } from '../src/services/eventRepository.ts';
import { toFeedCardEvent } from '../src/services/eventFeed.ts';
import {
  detailToViewEvent,
  mapHighlightFor,
  primaryLink,
  resolveDetailScreen,
  statusBanner,
} from '../src/services/eventDetailsView.ts';
import { categoryForSlug } from '../src/services/mapEvents.ts';

const PASSWORD = 'password123';
// The seed's dates are fixed to the 2026-27 academic year
// (supabase/scripts/seed-data.mjs). Move NOW with them when they are refreshed.
const NOW = new Date('2026-11-09T17:00:00Z');

// Same IDs as supabase/scripts/generate-seed.mjs.
const seedId = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eventId = n => seedId('e0', n);
const occurrenceId = (eventN, index) => seedId('f0', eventN * 100 + index);
const EVENT = {
  jazzJam: eventId(1),
  trailRun: eventId(2),
  harvestFestival: eventId(3),
  speakerSeries: eventId(4),
  resumeWorkshop: eventId(5),
  orchestra: eventId(6),
  chessClub: eventId(10),
  draftShowcase: eventId(12),
  postponedConcert: eventId(14),
  privateLunch: eventId(16),
};

let client;
let events;

before(async () => {
  const connection = localConnection();
  client = createClient(connection.API_URL, connection.PUBLISHABLE_KEY ?? connection.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: 'seed.student1@example.test', password: PASSWORD });
  if (error) throw error;
  events = createSupabaseEventRepository((fn, args) => client.rpc(fn, args), () => NOW);
});

after(async () => {
  // Local scope ends only this test's session. The default (global) would also
  // sign the seed user out of a running app, such as a developer's emulator.
  await client?.auth.signOut({ scope: 'local' }).catch(() => {});
});

const view = detail => detailToViewEvent(detail, categoryForSlug(detail.categorySlug), null, NOW);

test('Home lists seeded upcoming events in start order, without hidden or unavailable ones', async () => {
  const page = await events.listFeed({ from: NOW });
  assert.deepEqual(page.items.map(item => item.title), [
    'Tuesday Night Jazz Jam',
    'Chess Club Open Night',
    'Saturday Morning Trail Run',
    'Mindful Mornings Yoga', // signed-in only: visible to a signed-in student
    'Sustainability Speaker Series',
    'Winter Orchestra Concert',
    'Resume Review Workshop (Online)',
  ]);
  const ids = page.items.map(item => item.eventId);
  for (const hidden of [EVENT.draftShowcase, EVENT.postponedConcert, EVENT.privateLunch]) {
    assert.ok(!ids.includes(hidden), `${hidden} must not be in the feed`);
  }
  assert.equal(page.nextCursor, null);
});

test('Home cards carry the canonical event and the occurrence Details should open', async () => {
  const { items } = await events.listFeed({ from: NOW });
  const card = item => toFeedCardEvent(item, categoryForSlug(item.categorySlug));

  const chess = card(items.find(item => item.eventId === EVENT.chessClub));
  assert.equal(chess.occurrenceId, occurrenceId(10, 6));
  assert.deepEqual(
    { date: chess.date, time: chess.time, location: chess.location, category: chess.category },
    { date: 'Wed, Nov 11', time: '6:30 PM', location: 'Campus Center', category: 'Sports & Recreation' },
  );
  assert.equal(card(items.find(item => item.eventId === EVENT.resumeWorkshop)).location, 'Online');
});

test('Home search matches title, place and organizer; pages continue without repeats', async () => {
  const titles = async search => (await events.listFeed({ from: NOW, search })).items.map(item => item.title);
  assert.deepEqual(await titles('jazz'), ['Tuesday Night Jazz Jam']);
  assert.deepEqual(await titles("puffer's"), ['Saturday Morning Trail Run']);
  assert.deepEqual(await titles('chess society'), ['Chess Club Open Night']);

  const all = (await events.listFeed({ from: NOW })).items.map(item => item.eventId);
  const paged = [];
  let cursor = null;
  do {
    const page = await events.listFeed({ from: NOW }, cursor, 3);
    paged.push(...page.items.map(item => item.eventId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(paged, all);
});

test('Details shows a hybrid event with its time range, address, join link and more dates', async () => {
  const event = view(await events.getEventById(EVENT.speakerSeries));
  assert.equal(event.date, 'Thu, Dec 3');
  assert.equal(event.time, '6:00 PM – 7:30 PM');
  assert.equal(event.location, 'Campus Center, Auditorium');
  assert.equal(event.address, 'Amherst, MA 01003');
  assert.equal(event.directionsQuery, 'Campus Center, Amherst, MA 01003');
  assert.equal(event.virtualUrl, 'https://stream.example.test/sustainability-series');
  assert.equal(event.organizer, 'Campus Sustainability Circle');
  assert.deepEqual(event.moreDates.map(date => date.label), [
    'Thu, Feb 4 · 6:00 PM',
    'Thu, Mar 4 · 6:00 PM',
    'Thu, Apr 1 · 6:00 PM',
  ]);
  assert.equal(statusBanner(event), null);
  assert.equal(primaryLink(event), null, 'in-app RSVP only, so there is no page to send people to');
  assert.equal(mapHighlightFor(event, 1)?.highlightedEventId, EVENT.speakerSeries);
});

test('Details links go to the registration page, tickets or the official page', async () => {
  const orchestra = view(await events.getEventById(EVENT.orchestra));
  assert.deepEqual(primaryLink(orchestra), { label: 'Get tickets', url: 'https://tickets.example.test/winter-concert' });
  assert.equal(orchestra.officialUrl, 'https://calendar.example.test/event/winter-concert');

  const workshop = view(await events.getEventById(EVENT.resumeWorkshop));
  assert.deepEqual(primaryLink(workshop), { label: 'Register', url: 'https://register.example.test/resume-workshop' });
  assert.equal(workshop.location, 'Online');
  assert.equal(workshop.virtualUrl, 'https://meet.example.test/resume-workshop');
  assert.equal(workshop.directionsQuery, null);
  assert.equal(mapHighlightFor(workshop, 1), null);

  const chess = view(await events.getEventById(EVENT.chessClub));
  assert.deepEqual(primaryLink(chess), { label: 'Event page', url: 'https://pulse.example.test/event/chess-open-night' });
});

test('Details still opens a postponed event, labeled, with no map or sign-up', async () => {
  const concert = view(await events.getEventById(EVENT.postponedConcert));
  assert.equal(statusBanner(concert), 'This event has been postponed.');
  assert.deepEqual(primaryLink(concert), { label: 'Event page', url: 'https://tickets.example.test/spring-fling' });
  assert.equal(mapHighlightFor(concert, 1), null);
});

test('Details opened on a cancelled date shows that date with its own banner', async () => {
  const cancelled = occurrenceId(2, 8);
  const detail = await events.getEventById(EVENT.trailRun, cancelled);
  const screen = resolveDetailScreen({
    selectedOccurrenceId: cancelled,
    status: 'ready',
    detail,
    card: undefined,
    error: null,
    look: categoryForSlug,
    now: NOW,
  });
  assert.equal(screen.kind, 'show');
  assert.equal(screen.event.date, 'Sat, Oct 24');
  assert.equal(statusBanner(screen.event), 'This date has been cancelled.');
  assert.equal(mapHighlightFor(screen.event, 1), null);
});

test('Details shows an old saved event at its last date, labeled as ended', async () => {
  const festival = view(await events.getEventById(EVENT.harvestFestival));
  assert.equal(festival.date, 'Sun, Oct 25');
  assert.equal(festival.time, '10:00 AM – 5:00 PM');
  assert.equal(statusBanner(festival), 'This event has ended.');
  assert.deepEqual(festival.moreDates, []);
});

test('Details treats drafts, private events and old non-Supabase IDs as not found', async () => {
  assert.equal(await events.getEventById(EVENT.draftShowcase), null);
  assert.equal(await events.getEventById(EVENT.privateLunch), null);
  assert.equal(await events.getEventById('firestore-event-1'), null);
});
