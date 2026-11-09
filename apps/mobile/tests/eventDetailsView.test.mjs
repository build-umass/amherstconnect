import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardToViewEvent,
  detailsParamsForPin,
  occurrenceIdFromParams,
  newHighlightRequestId,
  detailToViewEvent,
  canAttend,
  eventIdForPin,
  eventIdFromParams,
  formatTimeRange,
  isHappening,
  mapHighlightFor,
  pickDisplayOccurrence,
  primaryLink,
  resolveDetailScreen,
  statusBanner,
} from '../src/services/eventDetailsView.ts';
import { filterIncludingStart } from '../src/services/mapEvents.ts';

const EVENT_ID = '00000000-0000-4000-8000-0000000000e1';
const look = () => ({ category: 'Arts & Culture', emoji: '🎨', color: '#BD1479' });
// Fixed "now" for anything that depends on whether the shown time is over.
const NOW = new Date('2026-11-10T15:00:00Z');

const occurrence = (overrides = {}) => ({
  id: 'occ-1',
  startsAt: '2026-11-12T23:00:00+00:00',
  endsAt: null,
  allDay: false,
  status: 'scheduled',
  locationType: 'physical',
  locationName: 'Bowker Auditorium',
  venueName: 'Bowker Auditorium',
  room: null,
  address: null,
  latitude: 42.3914,
  longitude: -72.5262,
  virtualUrl: null,
  ...overrides,
});

const detail = (overrides = {}) => ({
  eventId: EVENT_ID,
  title: 'Gallery Opening',
  description: 'Student art',
  imageUrl: null,
  status: 'published',
  timezone: 'America/New_York',
  isFree: true,
  officialUrl: 'https://events.umass.edu/event/gallery-opening',
  registrationUrl: null,
  categoryName: 'Arts & Culture',
  categorySlug: 'arts-culture',
  organizerName: 'Fine Arts Center',
  organizerUrl: null,
  occurrences: [occurrence()],
  ...overrides,
});

const card = {
  id: '1',
  title: 'SASA Bollywood Night',
  category: 'Campus',
  date: 'Fri, May 1',
  time: '7:00 PM',
  location: 'Mullins Center',
  emoji: '💃',
};

// ── Params ───────────────────────────────────────────────────────────────────

test('the event ID comes from eventId, else from the passed card', () => {
  assert.equal(eventIdFromParams({ eventId: EVENT_ID }), EVENT_ID);
  assert.equal(eventIdFromParams({ event: card }), '1');
  assert.equal(eventIdFromParams({ eventId: EVENT_ID, event: card }), EVENT_ID);
  assert.equal(eventIdFromParams(undefined), null);
});

test('map pins (occurrence IDs) resolve to their event ID', () => {
  const pins = [{ id: 'occ-1', eventId: EVENT_ID }, { id: 'occ-2', eventId: 'other' }];
  assert.equal(eventIdForPin(pins, 'occ-1'), EVENT_ID);
  assert.equal(eventIdForPin(pins, 'missing'), null);
});

// ── What to show ─────────────────────────────────────────────────────────────

test('shows the next scheduled time, skipping a cancelled one', () => {
  const picked = pickDisplayOccurrence([
    occurrence({ id: 'a', status: 'cancelled' }),
    occurrence({ id: 'b' }),
  ]);
  assert.equal(picked.id, 'b');
  assert.equal(pickDisplayOccurrence([occurrence({ id: 'c', status: 'cancelled' })]).id, 'c');
  assert.equal(pickDisplayOccurrence([]), null);
});

test('a Supabase event becomes the screen event with real ID, time and link', () => {
  const view = detailToViewEvent(detail(), look());
  assert.equal(view.id, EVENT_ID);
  assert.equal(view.date, 'Thu, Nov 12');
  assert.equal(view.time, '6:00 PM');
  assert.equal(view.location, 'Bowker Auditorium');
  assert.equal(view.organizer, 'Fine Arts Center');
  assert.equal(view.officialUrl, 'https://events.umass.edu/event/gallery-opening');
  assert.equal(view.latitude, 42.3914);
  assert.equal(view.status, 'published');
});

test('room, online and missing locations are labeled', () => {
  assert.equal(detailToViewEvent(detail({ occurrences: [occurrence({ room: '101', locationName: 'Campus Center' })] }), look()).location, 'Campus Center, Room 101');
  assert.equal(detailToViewEvent(detail({ occurrences: [occurrence({ locationType: 'virtual', locationName: null, venueName: null })] }), look()).location, 'Online');
  const none = detailToViewEvent(detail({ occurrences: [] }), look());
  assert.equal(none.location, 'Location TBA');
  assert.equal(none.date, 'Date TBA');
  assert.equal(none.latitude, undefined);
});

test('loaded Supabase event wins over the passed card', () => {
  const state = resolveDetailScreen({ status: 'ready', detail: detail(), card, error: null, look });
  assert.equal(state.kind, 'show');
  assert.equal(state.event.title, 'Gallery Opening');
  assert.equal(state.refreshing, false);
});

test('the passed card shows instantly while loading', () => {
  const state = resolveDetailScreen({ status: 'loading', detail: null, card, error: null, look });
  assert.equal(state.kind, 'show');
  assert.equal(state.event.title, 'SASA Bollywood Night');
  assert.equal(state.refreshing, true);
});

test('a passed card never hides a missing canonical event', () => {
  const state = resolveDetailScreen({ status: 'not-found', detail: null, card, error: null, look });
  assert.equal(state.kind, 'not-found');
});

test('with no card: loading, not found and error states', () => {
  assert.deepEqual(resolveDetailScreen({ status: 'loading', detail: null, card: undefined, error: null, look }), { kind: 'loading' });
  assert.deepEqual(resolveDetailScreen({ status: 'not-found', detail: null, card: undefined, error: null, look }), { kind: 'not-found' });
  assert.deepEqual(
    resolveDetailScreen({ status: 'error', detail: null, card: undefined, error: 'timeout', look }),
    { kind: 'error', message: 'timeout' },
  );
});

// ── Cancelled and View on Map ────────────────────────────────────────────────

test('cancelled and postponed events get a banner', () => {
  assert.equal(statusBanner(detailToViewEvent(detail({ status: 'cancelled' }), look())), 'This event has been cancelled.');
  assert.equal(statusBanner(detailToViewEvent(detail({ status: 'postponed' }), look())), 'This event has been postponed.');
  assert.equal(statusBanner(detailToViewEvent(detail(), look(), null, NOW)), null);
});

test('View on Map targets the event with its location and start time', () => {
  const target = mapHighlightFor(detailToViewEvent(detail(), look()), 3);
  assert.deepEqual(target, {
    highlightedEventId: EVENT_ID,
    highlightedOccurrenceId: 'occ-1',
    latitude: 42.3914,
    longitude: -72.5262,
    startsAt: '2026-11-12T23:00:00+00:00',
    highlightRequestId: 3,
  });
});

test('View on Map is hidden with no location, or when cancelled or postponed', () => {
  assert.equal(mapHighlightFor(detailToViewEvent(detail({ occurrences: [occurrence({ latitude: null, longitude: null })] }), look()), 1), null);
  assert.equal(mapHighlightFor(cardToViewEvent(card), 1), null, 'old mock cards have no coordinates');
  assert.equal(mapHighlightFor(detailToViewEvent(detail({ status: 'cancelled' }), look()), 1), null);
  assert.equal(mapHighlightFor(detailToViewEvent(detail({ status: 'postponed' }), look()), 1), null);
});

test('the map keeps its time filter if it includes the event, else uses This Week', () => {
  const now = new Date('2026-11-10T15:00:00Z');
  assert.equal(filterIncludingStart('Today', '2026-11-10T20:00:00Z', now), 'Today');
  assert.equal(filterIncludingStart('Now', '2026-11-12T20:00:00Z', now), 'This Week');
  assert.equal(filterIncludingStart('This Week', '2026-11-12T20:00:00Z', now), 'This Week');
  assert.equal(filterIncludingStart('Today', 'not a date', now), 'Today');
});

test('Map -> Details -> Map preserves a non-first occurrence and its date/location', () => {
 const second = occurrence({id:'occ-2',startsAt:'2026-12-05T18:00:00Z',locationName:'Second venue',latitude:42.4});
 const pin={...card,id:second.id,eventId:EVENT_ID,latitude:second.latitude};
 const params=detailsParamsForPin([pin],pin.id);
 assert.equal(eventIdFromParams(params),EVENT_ID);assert.equal(occurrenceIdFromParams(params),'occ-2');
 const loaded=detail({occurrences:[occurrence(),second]});
 const state=resolveDetailScreen({status:'ready',detail:loaded,card:params.event,error:null,look,selectedOccurrenceId:occurrenceIdFromParams(params)});
 assert.equal(state.kind,'show');assert.equal(state.event.startsAt,second.startsAt);assert.equal(state.event.location,'Second venue');
 const target=mapHighlightFor(state.event,newHighlightRequestId());assert.equal(target.highlightedOccurrenceId,'occ-2');assert.equal(target.latitude,42.4);
 assert.equal(detailsParamsForPin([pin],'missing'),null);
});
test('Home feed occurrence ID is accepted without a separate explicit parameter',()=>{
 assert.equal(occurrenceIdFromParams({event:{...card,occurrenceId:'home-occ'}}),'home-occ');
});
test('canonical error with preview shows retry state; missing selected occurrence never switches dates',()=>{
 assert.deepEqual(resolveDetailScreen({status:'error',detail:null,card:{...card,id:EVENT_ID},error:'Failed to load',look}),{kind:'error',message:'Failed to load'});
 assert.equal(resolveDetailScreen({status:'ready',detail:detail(),card,error:null,look,selectedOccurrenceId:'missing'}).kind,'not-found');
});
test('reopening Details produces unique highlight requests across mounts',()=>{
 const firstMount=newHighlightRequestId(),secondMount=newHighlightRequestId();
 assert.notEqual(firstMount,secondMount);assert.notEqual(newHighlightRequestId(),secondMount);
});
test('cancelled selected occurrence cannot be highlighted as an available pin',()=>{
 const view=detailToViewEvent(detail({occurrences:[occurrence({status:'cancelled'})]}),look(),'occ-1');assert.equal(mapHighlightFor(view,newHighlightRequestId()),null);
});

// ── E03: the rest of the E02 event ───────────────────────────────────────────

const ZONE = 'America/New_York';

test('the time row shows start and end, crossing midnight with the end date', () => {
  const at = (startsAt, endsAt, allDay = false) => formatTimeRange({ startsAt, endsAt, allDay }, ZONE);
  assert.equal(at('2026-12-03T23:00:00Z', '2026-12-04T00:30:00Z'), '6:00 PM – 7:30 PM');
  assert.equal(at('2026-12-06T00:00:00Z', '2026-12-06T06:00:00Z'), '7:00 PM – Sun, Dec 6, 1:00 AM');
  assert.equal(at('2026-12-03T23:00:00Z', null), '6:00 PM');
  assert.equal(at('2026-12-03T23:00:00Z', '2026-12-03T22:00:00Z'), '6:00 PM', 'an end before the start is ignored');
  assert.equal(at('2026-11-07T05:00:00Z', '2026-11-08T05:00:00Z', true), 'All day');
});

test('the screen event uses the time range', () => {
  const view = detailToViewEvent(detail({ occurrences: [occurrence({ endsAt: '2026-11-13T00:30:00+00:00' })] }), look());
  assert.equal(view.time, '6:00 PM – 7:30 PM');
});

test('named rooms are not prefixed with "Room"', () => {
  const view = detailToViewEvent(detail({ occurrences: [occurrence({ locationName: 'Campus Center', room: 'Auditorium' })] }), look());
  assert.equal(view.location, 'Campus Center, Auditorium');
});

test('a physical event carries its address and what to search for in the maps app', () => {
  const view = detailToViewEvent(detail({
    occurrences: [occurrence({ locationName: 'Campus Center', venueName: 'Campus Center', room: 'Auditorium', address: '1 Campus Center Way, Amherst, MA 01003' })],
  }), look());
  assert.equal(view.address, '1 Campus Center Way, Amherst, MA 01003');
  assert.equal(view.directionsQuery, 'Campus Center, 1 Campus Center Way, Amherst, MA 01003', 'the room is left out of the search');
  assert.equal(view.virtualUrl, null);
  assert.equal(view.locationType, 'physical');
});

test('online events have a join link and nowhere to get directions to', () => {
  const view = detailToViewEvent(detail({
    occurrences: [occurrence({ locationType: 'virtual', locationName: null, venueName: null, address: 'ignored', virtualUrl: 'https://meet.example.test/x', latitude: null, longitude: null })],
  }), look());
  assert.equal(view.location, 'Online');
  assert.equal(view.virtualUrl, 'https://meet.example.test/x');
  assert.equal(view.address, null);
  assert.equal(view.directionsQuery, null);
});

test('hybrid events have both directions and a join link', () => {
  const view = detailToViewEvent(detail({
    occurrences: [occurrence({ locationType: 'hybrid', address: 'Amherst, MA 01003', virtualUrl: 'https://stream.example.test/x' })],
  }), look());
  assert.equal(view.directionsQuery, 'Bowker Auditorium, Amherst, MA 01003');
  assert.equal(view.virtualUrl, 'https://stream.example.test/x');
});

test('the image and registration link come through from E02', () => {
  const view = detailToViewEvent(detail({ imageUrl: 'https://img.example.test/a.jpg', registrationUrl: 'https://register.example.test/a' }), look());
  assert.equal(view.imageUrl, 'https://img.example.test/a.jpg');
  assert.equal(view.registrationUrl, 'https://register.example.test/a');
});

test('More dates lists the other times soonest first and labels ones not happening', () => {
  const view = detailToViewEvent(detail({
    occurrences: [
      occurrence({ id: 'later', startsAt: '2026-11-26T23:00:00Z' }),
      occurrence({ id: 'shown', startsAt: '2026-11-12T23:00:00Z' }),
      occurrence({ id: 'off', startsAt: '2026-11-19T23:00:00Z', status: 'cancelled' }),
      occurrence({ id: 'allday', startsAt: '2026-12-01T05:00:00Z', allDay: true }),
    ],
  }), look(), 'shown');
  assert.deepEqual(view.moreDates, [
    { id: 'off', label: 'Thu, Nov 19 · 6:00 PM · Cancelled', status: 'cancelled' },
    { id: 'later', label: 'Thu, Nov 26 · 6:00 PM', status: 'scheduled' },
    { id: 'allday', label: 'Tue, Dec 1 · All day', status: 'scheduled' },
  ]);
  assert.deepEqual(detailToViewEvent(detail(), look()).moreDates, [], 'a single time has no more dates');
});

test('a cancelled or postponed date gets its own banner', () => {
  const cancelled = detailToViewEvent(detail({ occurrences: [occurrence({ status: 'cancelled' })] }), look(), 'occ-1');
  assert.equal(statusBanner(cancelled), 'This date has been cancelled.');
  const postponed = detailToViewEvent(detail({ occurrences: [occurrence({ status: 'postponed' })] }), look(), 'occ-1');
  assert.equal(statusBanner(postponed), 'This date has been postponed.');
  assert.equal(statusBanner(detailToViewEvent(detail({ status: 'cancelled', occurrences: [occurrence({ status: 'cancelled' })] }), look())), 'This event has been cancelled.', 'the whole event wins');
});

test('isHappening is false once the event or the shown date is off', () => {
  assert.equal(isHappening({ status: 'published', occurrenceStatus: 'scheduled' }), true);
  assert.equal(isHappening({ status: 'published' }), true, 'cards have no occurrence status');
  assert.equal(isHappening({ status: 'published', occurrenceStatus: 'cancelled' }), false);
  assert.equal(isHappening({ status: 'postponed', occurrenceStatus: 'scheduled' }), false);
});

test('the footer link is registration first, tickets for paid events, else the event page', () => {
  const base = { status: 'published', occurrenceStatus: 'scheduled', isFree: true, officialUrl: 'https://events.example.test/a', registrationUrl: null };
  assert.deepEqual(primaryLink({ ...base, registrationUrl: 'https://register.example.test/a' }), { label: 'Register', url: 'https://register.example.test/a' });
  assert.deepEqual(primaryLink({ ...base, isFree: false, registrationUrl: 'https://tickets.example.test/a' }), { label: 'Get tickets', url: 'https://tickets.example.test/a' });
  assert.deepEqual(primaryLink(base), { label: 'Event page', url: 'https://events.example.test/a' });
  assert.equal(primaryLink({ ...base, officialUrl: null }), null, 'no link at all hides the button');
});

test('cancelled or postponed events offer the event page instead of sign-up', () => {
  const links = { isFree: true, officialUrl: 'https://events.example.test/a', registrationUrl: 'https://register.example.test/a' };
  assert.deepEqual(primaryLink({ ...links, status: 'cancelled' }), { label: 'Event page', url: 'https://events.example.test/a' });
  assert.deepEqual(primaryLink({ ...links, status: 'published', occurrenceStatus: 'postponed' }), { label: 'Event page', url: 'https://events.example.test/a' });
  assert.equal(primaryLink({ ...links, status: 'cancelled', officialUrl: null }), null);
});

test('a time that is over is marked ended, by the same rule E02 uses', () => {
  const ended = o => detailToViewEvent(detail({ occurrences: [occurrence(o)] }), look(), null, NOW).ended;
  assert.equal(ended({ startsAt: '2026-11-10T14:00:00Z', endsAt: '2026-11-10T16:00:00Z' }), false, 'still running');
  assert.equal(ended({ startsAt: '2026-11-10T13:00:00Z', endsAt: '2026-11-10T15:00:00Z' }), true, 'ends exactly now');
  assert.equal(ended({ startsAt: '2026-11-10T14:59:00Z', endsAt: null }), true, 'no end time: over once started');
  assert.equal(ended({ startsAt: '2026-11-10T15:00:00Z', endsAt: null }), false, 'starting now');
});

test('an event that is over is labeled and offers only its event page; the map still shows where it was', () => {
  const past = detailToViewEvent(detail({
    registrationUrl: 'https://register.example.test/a',
    occurrences: [occurrence({ startsAt: '2026-10-25T14:00:00Z', endsAt: '2026-10-25T21:00:00Z', locationType: 'hybrid', virtualUrl: 'https://meet.example.test/a' })],
  }), look(), null, NOW);
  assert.equal(statusBanner(past), 'This event has ended.');
  assert.equal(canAttend(past), false);
  assert.deepEqual(primaryLink(past), { label: 'Event page', url: 'https://events.umass.edu/event/gallery-opening' });
  assert.notEqual(mapHighlightFor(past, 1), null);
});

test('a past date of an event with later dates says that date has passed', () => {
  const view = detailToViewEvent(detail({
    occurrences: [
      occurrence({ id: 'past', startsAt: '2026-11-09T23:00:00Z', endsAt: '2026-11-10T01:00:00Z' }),
      occurrence({ id: 'next', startsAt: '2026-11-16T23:00:00Z' }),
    ],
  }), look(), 'past', NOW);
  assert.equal(statusBanner(view), 'This date has passed.');
});
