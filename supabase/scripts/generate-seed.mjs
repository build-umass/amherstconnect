#!/usr/bin/env node
// Generates supabase/seed.sql from supabase/scripts/seed-data.mjs.
//
//   node supabase/scripts/generate-seed.mjs          rewrite seed.sql
//   node supabase/scripts/generate-seed.mjs --check  fail if seed.sql is stale
//
// Output is deterministic: fixed IDs, fixed timestamps and a fixed row order,
// so regenerating without data changes produces an identical file.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as data from './seed-data.mjs';

const SEED_PATH = fileURLToPath(new URL('../seed.sql', import.meta.url));
const TIMEZONE = 'America/New_York';
const AUTH_INSTANCE_ID = '00000000-0000-0000-0000-000000000000';

// Readable, collision-free IDs: <2 hex prefix>000000-0000-4000-8000-<n>.
const ID_PREFIX = {
  user: 'a0',
  identity: 'a1',
  organization: 'b0',
  venue: 'c0',
  category: 'd0',
  event: 'e0',
  occurrence: 'f0',
  rsvp: '70',
};

function uuid(kind, n) {
  return `${ID_PREFIX[kind]}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

// Occurrence IDs are stable per event: event 3, occurrence 2 -> ...000000000302.
function occurrenceId(eventN, index) {
  return uuid('occurrence', eventN * 100 + index);
}

const raw = (sql) => ({ raw: sql });

function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object' && 'raw' in value) return value.raw;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const timestamp = (wallClock) => raw(`'${wallClock} ${TIMEZONE}'::timestamptz`);
const point = (lon, lat) =>
  raw(`extensions.st_setsrid(extensions.st_makepoint(${lon}, ${lat}), 4326)::extensions.geography`);

function addMinutes(wallClock, minutes) {
  const [date, time] = wallClock.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  return shifted.toISOString().slice(0, 16).replace('T', ' ');
}

function insert(table, rows, conflict) {
  const columns = Object.keys(rows[0]);
  const values = rows
    .map((row) => `  (${columns.map((column) => literal(row[column])).join(', ')})`)
    .join(',\n');

  return `insert into ${table} (${columns.join(', ')})\nvalues\n${values}\non conflict (${conflict}) do nothing;\n`;
}

function sourceColumns(source) {
  return {
    source_type: source?.type ?? 'amherst_connect',
    external_id: source?.externalId ?? null,
    source_url: source?.url ?? null,
  };
}

// Row timestamps come from a simulated activity log: each action (a signup, a
// new event, a cancellation...) happens 1-6 hours after the previous one, in
// dependency order. A seeded PRNG keeps the gaps random-looking but identical
// on every run. Adding or reordering seed data shifts every later timestamp.
const TIMELINE_START = Date.UTC(2026, 3, 1, 13, 0); // 2026-04-01 09:00 America/New_York
const TIMELINE_SEED = 20260401;
const MIN_GAP_MINUTES = 60;
const MAX_GAP_MINUTES = 360;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Converts an America/New_York wall-clock string to epoch milliseconds.
function wallClockMs(wallClock) {
  const [date, time] = wallClock.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(zoneFormat.formatToParts(asUtc).map((part) => [part.type, part.value]));
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - asUtc;
  return asUtc - offset;
}

const at = (ms) => raw(`'${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}+00'::timestamptz`);
const rowTimes = (created, updated = created) => ({ created_at: at(created), updated_at: at(updated) });
const occurrenceStartMs = (occurrence) => wallClockMs(occurrence.start);
const occurrenceEndMs = (occurrence) =>
  wallClockMs(occurrence.minutes ? addMinutes(occurrence.start, occurrence.minutes) : occurrence.start);

function buildTimeline() {
  const random = mulberry32(TIMELINE_SEED);
  let clock = TIMELINE_START;
  const next = (notBefore = clock) => {
    const gap = MIN_GAP_MINUTES + Math.floor(random() * (MAX_GAP_MINUTES - MIN_GAP_MINUTES + 1));
    clock = Math.max(clock, notBefore) + gap * 60_000;
    return clock;
  };
  const created = (items) => new Map(items.map((item) => [item.n, next()]));

  // Reference data first, then people, then content that depends on both.
  const categories = created(data.categories);
  const venues = created(data.venues);
  const organizations = created(data.organizations);
  const users = created(data.users);
  const events = created(data.events);
  const bookmarks = new Map(data.bookmarks.map((bookmark) => [`${bookmark.user}:${bookmark.event}`, next()]));
  const rsvps = created(data.rsvps);

  // Later edits: status changes on events, occurrences and RSVPs. Archiving
  // waits until the event's last occurrence has ended.
  const eventUpdates = new Map();
  const occurrenceUpdates = new Map();
  for (const event of data.events) {
    const status = event.status ?? 'published';
    const changed = event.occurrences.flatMap((occurrence, i) =>
      (occurrence.status ?? 'scheduled') === 'scheduled' ? [] : [occurrenceId(event.n, i + 1)],
    );
    if ((status === 'published' || status === 'draft') && changed.length === 0) continue;

    const notBefore = status === 'archived' ? Math.max(...event.occurrences.map(occurrenceEndMs)) : clock;
    const time = next(notBefore);
    if (status !== 'published' && status !== 'draft') eventUpdates.set(event.n, time);
    for (const id of changed) occurrenceUpdates.set(id, time);
  }
  const rsvpUpdates = new Map(
    data.rsvps.filter((rsvp) => (rsvp.status ?? 'going') !== 'going').map((rsvp) => [rsvp.n, next()]),
  );

  for (const event of data.events) {
    const firstStart = Math.min(...event.occurrences.map(occurrenceStartMs));
    if (events.get(event.n) >= firstStart) throw new Error(`event ${event.n} is created after its first occurrence`);
    event.occurrences.forEach((occurrence, i) => {
      const update = occurrenceUpdates.get(occurrenceId(event.n, i + 1));
      if (update && (event.status ?? 'published') !== 'archived' && update >= occurrenceStartMs(occurrence)) {
        throw new Error(`event ${event.n} occurrence ${i + 1} changes status after it starts`);
      }
    });
  }

  return { categories, venues, organizations, users, events, bookmarks, rsvps, eventUpdates, occurrenceUpdates, rsvpUpdates };
}

function buildRows() {
  const timeline = buildTimeline();
  const authUsers = data.users.map((user) => ({
    instance_id: AUTH_INSTANCE_ID,
    id: uuid('user', user.n),
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    encrypted_password: raw(`extensions.crypt(${literal(data.SEED_PASSWORD)}, extensions.gen_salt('bf'))`),
    email_confirmed_at: at(timeline.users.get(user.n)),
    raw_app_meta_data: raw(`'{"provider":"email","providers":["email"]}'::jsonb`),
    raw_user_meta_data: raw(`'${JSON.stringify({ display_name: user.displayName })}'::jsonb`),
    confirmation_token: '',
    recovery_token: '',
    email_change: '',
    email_change_token_new: '',
    ...rowTimes(timeline.users.get(user.n)),
  }));

  const authIdentities = data.users.map((user) => ({
    id: uuid('identity', user.n),
    user_id: uuid('user', user.n),
    provider_id: uuid('user', user.n),
    provider: 'email',
    identity_data: raw(
      `'${JSON.stringify({ sub: uuid('user', user.n), email: user.email, email_verified: true })}'::jsonb`,
    ),
    last_sign_in_at: null,
    ...rowTimes(timeline.users.get(user.n)),
  }));

  const profiles = data.users.map((user) => ({
    id: uuid('user', user.n),
    display_name: user.displayName,
    avatar_url: null,
    role: user.role,
    onboarding_complete: user.onboarded,
    ...rowTimes(timeline.users.get(user.n)),
  }));

  const organizations = data.organizations.map((org) => ({
    id: uuid('organization', org.n),
    name: org.name,
    slug: org.slug,
    description: org.description ?? null,
    website_url: org.websiteUrl ?? null,
    logo_url: null,
    ...sourceColumns(org.source),
    source_updated_at: org.source ? at(timeline.organizations.get(org.n)) : null,
    ...rowTimes(timeline.organizations.get(org.n)),
  }));

  const venues = data.venues.map((venue) => ({
    id: uuid('venue', venue.n),
    name: venue.name,
    room: venue.room ?? null,
    address_line_1: null,
    address_line_2: null,
    city: venue.city,
    region: venue.region,
    postal_code: venue.postalCode,
    country_code: 'US',
    coordinates: point(venue.lon, venue.lat),
    ...sourceColumns(venue.source),
    source_updated_at: venue.source ? at(timeline.venues.get(venue.n)) : null,
    ...rowTimes(timeline.venues.get(venue.n)),
  }));

  const categories = data.categories.map((category) => ({
    id: uuid('category', category.n),
    name: category.name,
    slug: category.slug,
    description: category.description,
    ...rowTimes(timeline.categories.get(category.n)),
  }));

  const events = data.events.map((event) => ({
    id: uuid('event', event.n),
    title: event.title,
    description: event.description,
    image_url: null,
    organization_id: event.org ? uuid('organization', event.org) : null,
    primary_category_id: uuid('category', event.categories[0]),
    status: event.status ?? 'published',
    visibility: event.visibility ?? 'public',
    timezone: TIMEZONE,
    registration_type: event.registrationType ?? 'none',
    registration_url: event.registrationUrl ?? null,
    is_free: event.isFree ?? true,
    featured_rank: event.featuredRank ?? null,
    ...sourceColumns(event.source),
    source_updated_at: event.source ? at(timeline.events.get(event.n)) : null,
    created_by: event.createdBy ? uuid('user', event.createdBy) : null,
    updated_by: event.createdBy ? uuid('user', event.createdBy) : null,
    ...rowTimes(timeline.events.get(event.n), timeline.eventUpdates.get(event.n)),
  }));

  const eventCategories = data.events.flatMap((event) =>
    event.categories.map((category) => ({
      event_id: uuid('event', event.n),
      category_id: uuid('category', category),
      ...rowTimes(timeline.events.get(event.n)),
    })),
  );

  const occurrences = data.events.flatMap((event) =>
    event.occurrences.map((occurrence, i) => {
      const index = i + 1;
      const id = occurrenceId(event.n, index);
      const created = timeline.events.get(event.n);
      const venue = occurrence.venue ?? event.venue ?? null;
      const locationName = occurrence.locationName ?? null;
      const virtualUrl = occurrence.virtualUrl ?? null;
      const hasPlace = venue !== null || locationName !== null;
      const locationType = virtualUrl ? (hasPlace ? 'hybrid' : 'virtual') : 'physical';

      return {
        id,
        event_id: uuid('event', event.n),
        venue_id: venue ? uuid('venue', venue) : null,
        starts_at: timestamp(occurrence.start),
        ends_at: occurrence.minutes ? timestamp(addMinutes(occurrence.start, occurrence.minutes)) : null,
        all_day: occurrence.allDay ?? false,
        status: occurrence.status ?? 'scheduled',
        location_type: locationType,
        location_name: locationName,
        coordinates: null,
        virtual_url: virtualUrl,
        source_attendance_count: null,
        source_type: event.source?.type ?? 'amherst_connect',
        external_id: event.source ? `${event.source.externalId}-${index}` : null,
        source_updated_at: event.source ? at(created) : null,
        ...rowTimes(created, timeline.occurrenceUpdates.get(id)),
      };
    }),
  );

  const bookmarks = data.bookmarks.map((bookmark) => ({
    profile_id: uuid('user', bookmark.user),
    event_id: uuid('event', bookmark.event),
    ...rowTimes(timeline.bookmarks.get(`${bookmark.user}:${bookmark.event}`)),
  }));

  const rsvps = data.rsvps.map((rsvp) => ({
    id: uuid('rsvp', rsvp.n),
    profile_id: uuid('user', rsvp.user),
    occurrence_id: occurrenceId(rsvp.event, rsvp.occurrence),
    status: rsvp.status ?? 'going',
    ...rowTimes(timeline.rsvps.get(rsvp.n), timeline.rsvpUpdates.get(rsvp.n)),
  }));

  return { authUsers, authIdentities, profiles, organizations, venues, categories, events, eventCategories, occurrences, bookmarks, rsvps };
}

// Catch data mistakes the database would otherwise only report at reset time,
// plus app-level rules RLS enforces for clients but the seed role bypasses.
function validate() {
  const eventsByN = new Map(data.events.map((event) => [event.n, event]));
  const ranks = data.events
    .filter((event) => event.featuredRank && (event.status ?? 'published') === 'published')
    .map((event) => event.featuredRank);
  if (new Set(ranks).size !== ranks.length) throw new Error('featuredRank must be unique among published events');

  for (const rsvp of data.rsvps) {
    const event = eventsByN.get(rsvp.event);
    const occurrence = event?.occurrences[rsvp.occurrence - 1];
    if (!occurrence) throw new Error(`rsvp ${rsvp.n} references a missing occurrence`);
    if (event.registrationType !== 'internal' || (event.status ?? 'published') !== 'published') {
      throw new Error(`rsvp ${rsvp.n} must target a published event with internal registration`);
    }
    if ((occurrence.status ?? 'scheduled') !== 'scheduled') {
      throw new Error(`rsvp ${rsvp.n} must target a scheduled occurrence`);
    }
  }

  for (const event of data.events) {
    if (event.occurrences.length > 99) throw new Error(`event ${event.n} exceeds 99 occurrences`);
  }
}

function render() {
  validate();
  const rows = buildRows();

  return `-- GENERATED by supabase/scripts/generate-seed.mjs from seed-data.mjs. Do not edit by hand.
-- Regenerate with: npm run db:seed:generate
--
-- Deterministic, entirely fake development data loaded by \`supabase db reset\`.
-- Runs as the privileged postgres role, so RLS does not apply to these inserts.
-- Fixed IDs, fixed timestamps and \`on conflict do nothing\` make every load
-- produce the same rows; re-running against an already seeded database is a
-- no-op. To apply edited seed data, run \`supabase db reset\`. The only value
-- that differs between resets is each seed user's bcrypt password hash.
-- Every seed user signs in with password "${data.SEED_PASSWORD}".

begin;

${insert('auth.users', rows.authUsers, 'id')}
${insert('auth.identities', rows.authIdentities, 'id')}
${insert('public.profiles', rows.profiles, 'id')}
${insert('public.organizations', rows.organizations, 'id')}
${insert('public.venues', rows.venues, 'id')}
${insert('public.categories', rows.categories, 'id')}
${insert('public.events', rows.events, 'id')}
${insert('public.event_categories', rows.eventCategories, 'event_id, category_id')}
${insert('public.event_occurrences', rows.occurrences, 'id')}
${insert('public.bookmarks', rows.bookmarks, 'profile_id, event_id')}
${insert('public.rsvps', rows.rsvps, 'id')}
commit;
`;
}

const output = render();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(SEED_PATH, 'utf8');
  } catch {
    // Missing file is reported as stale below.
  }
  if (current !== output) {
    console.error('supabase/seed.sql is out of date. Run: npm run db:seed:generate');
    process.exit(1);
  }
  console.log('supabase/seed.sql is up to date.');
} else {
  writeFileSync(SEED_PATH, output);
  console.log(`Wrote ${SEED_PATH}`);
}
