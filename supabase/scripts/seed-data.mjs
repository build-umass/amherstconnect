// Fake, deterministic seed data for local Supabase development.
// Every person, email, organization and event here is fictional. Venue names
// refer to public places in Amherst, MA only to make the data feel realistic.
//
// Times are America/New_York wall-clock strings ("YYYY-MM-DD HH:MM"). Dates are
// fixed to the 2026-27 academic year; refresh them around spring 2027 so the
// feed keeps upcoming events.
//
// After editing, run `npm run db:seed:generate` to rewrite supabase/seed.sql.

export const SEED_PASSWORD = 'password123';

export const users = [
  { n: 1, email: 'seed.student1@example.test', displayName: 'Riley Seedwell', role: 'student', onboarded: true },
  { n: 2, email: 'seed.student2@example.test', displayName: 'Jordan Testa', role: 'student', onboarded: false },
  { n: 3, email: 'seed.faculty@example.test', displayName: 'Morgan Sample', role: 'faculty_staff', onboarded: true },
  { n: 4, email: 'seed.alumni@example.test', displayName: 'Casey Placeholder', role: 'alumni', onboarded: true },
  { n: 5, email: 'seed.resident@example.test', displayName: 'Avery Fixture', role: 'local_resident', onboarded: true },
  { n: 6, email: 'seed.student3@example.test', displayName: 'Quinn Demo', role: 'student', onboarded: true },
];

export const organizations = [
  {
    n: 1,
    name: 'Amherst Student Jazz Collective',
    slug: 'amherst-student-jazz-collective',
    description: 'Student musicians who host open jam sessions and small-combo shows around town.',
    websiteUrl: 'https://jazz.example.test',
  },
  {
    n: 2,
    name: 'Pioneer Valley Trail Runners',
    slug: 'pioneer-valley-trail-runners',
    description: 'A friendly running group for all paces, meeting every Saturday morning.',
    websiteUrl: 'https://trailrunners.example.test',
  },
  {
    n: 3,
    name: 'Campus Sustainability Circle',
    slug: 'campus-sustainability-circle',
    description: 'Talks, workshops and volunteer days focused on climate and sustainability.',
  },
  {
    n: 4,
    name: 'Downtown Amherst Neighbors Association',
    slug: 'downtown-amherst-neighbors-association',
    description: 'Residents and local businesses organizing community events downtown.',
    websiteUrl: 'https://neighbors.example.test',
  },
  {
    n: 5,
    name: 'Campus Arts Series',
    slug: 'campus-arts-series',
    description: 'Concerts and performances imported from the campus events calendar.',
    source: { type: 'localist', externalId: 'seed-localist-org-5001', url: 'https://calendar.example.test/groups/arts-series' },
  },
  {
    n: 6,
    name: 'Amherst Chess Society',
    slug: 'amherst-chess-society',
    description: 'Casual and rated chess for every skill level.',
    source: { type: 'campus_pulse', externalId: 'seed-pulse-org-6001', url: 'https://pulse.example.test/organization/chess' },
  },
];

const AMHERST_CAMPUS = { city: 'Amherst', region: 'MA', postalCode: '01003' };
const AMHERST_TOWN = { city: 'Amherst', region: 'MA', postalCode: '01002' };

export const venues = [
  { n: 1, name: 'Student Union', room: 'Ballroom', ...AMHERST_CAMPUS, lat: 42.3911, lon: -72.5268 },
  { n: 2, name: 'Campus Center', room: 'Auditorium', ...AMHERST_CAMPUS, lat: 42.3917, lon: -72.5275 },
  { n: 3, name: 'Mullins Center', ...AMHERST_CAMPUS, lat: 42.3897, lon: -72.5313 },
  {
    n: 4,
    name: 'Fine Arts Center',
    room: 'Concert Hall',
    ...AMHERST_CAMPUS,
    lat: 42.388,
    lon: -72.525,
    source: { type: 'localist', externalId: 'seed-localist-venue-4001', url: 'https://calendar.example.test/places/fine-arts-center' },
  },
  { n: 5, name: 'Amherst Town Common', ...AMHERST_TOWN, lat: 42.3756, lon: -72.5197 },
  { n: 6, name: 'Jones Library', room: 'Woodbury Room', ...AMHERST_TOWN, lat: 42.3781, lon: -72.5208 },
  { n: 7, name: 'Kestrel Cafe', ...AMHERST_TOWN, lat: 42.377, lon: -72.5202 },
  { n: 8, name: "Puffer's Pond", ...AMHERST_TOWN, lat: 42.4078, lon: -72.5038 },
];

export const categories = [
  { n: 1, name: 'Music', slug: 'music', description: 'Concerts, jams and live performances.' },
  { n: 2, name: 'Arts & Culture', slug: 'arts-culture', description: 'Exhibitions, theater, film and literature.' },
  { n: 3, name: 'Sports & Recreation', slug: 'sports-recreation', description: 'Games, runs and outdoor activities.' },
  { n: 4, name: 'Academic & Talks', slug: 'academic-talks', description: 'Lectures, panels and workshops.' },
  { n: 5, name: 'Food & Drink', slug: 'food-drink', description: 'Markets, tastings and community meals.' },
  { n: 6, name: 'Community', slug: 'community', description: 'Neighborhood gatherings and volunteering.' },
  { n: 7, name: 'Wellness', slug: 'wellness', description: 'Fitness, mindfulness and health.' },
  { n: 8, name: 'Career', slug: 'career', description: 'Professional development and networking.' },
];

// Schedule helpers. Each returns a list of occurrence specs:
// { start: 'YYYY-MM-DD HH:MM', minutes, ...overrides }.

export function weekly({ start, count, minutes, ...rest }) {
  return Array.from({ length: count }, (_, i) => ({ start: shiftDays(start, 7 * i), minutes, ...rest }));
}

export function dates(starts, { minutes, ...rest } = {}) {
  return starts.map((start) => ({ start, minutes, ...rest }));
}

function shiftDays(wallClock, days) {
  const [date, time] = wallClock.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.toISOString().slice(0, 10)} ${time}`;
}

// Events. `occurrences` defaults: physical at the event's `venue`, scheduled.
// Per-occurrence overrides: status, venue, locationName, virtualUrl, allDay.
export const events = [
  {
    n: 1,
    title: 'Tuesday Night Jazz Jam',
    description: 'Bring an instrument or just listen. A house trio opens, then the stage is open to all players.',
    org: 1,
    categories: [1, 5],
    featuredRank: 1,
    createdBy: 3,
    venue: 7,
    occurrences: weekly({ start: '2026-09-29 19:30', count: 10, minutes: 120 }),
  },
  {
    n: 2,
    title: 'Saturday Morning Trail Run',
    description: 'A no-drop 5 mile loop around the pond with a shorter 3 mile option. RSVP so we know how many to expect.',
    org: 2,
    categories: [3, 7],
    registrationType: 'internal',
    createdBy: 5,
    venue: 8,
    occurrences: weekly({ start: '2026-09-05 08:00', count: 12, minutes: 90 }).map((occurrence, i) =>
      i === 7 ? { ...occurrence, status: 'cancelled' } : occurrence,
    ),
  },
  {
    n: 3,
    title: 'Fall Harvest Festival',
    description: 'Three days of local farm stands, cider pressing, live music and kids activities on the Common.',
    org: 4,
    categories: [6, 5],
    featuredRank: 2,
    createdBy: 5,
    venue: 5,
    occurrences: dates(['2026-10-23 10:00', '2026-10-24 10:00', '2026-10-25 10:00'], { minutes: 420 }),
  },
  {
    n: 4,
    title: 'Sustainability Speaker Series',
    description: 'Monthly talks from researchers and practitioners. Attend in person or join the livestream.',
    org: 3,
    categories: [4, 6],
    registrationType: 'internal',
    createdBy: 3,
    venue: 2,
    occurrences: dates(
      [
        '2026-10-01 18:00',
        '2026-11-05 18:00',
        '2026-12-03 18:00',
        '2027-02-04 18:00',
        '2027-03-04 18:00',
        '2027-04-01 18:00',
      ],
      { minutes: 90, virtualUrl: 'https://stream.example.test/sustainability-series' },
    ),
  },
  {
    n: 5,
    title: 'Resume Review Workshop (Online)',
    description: 'Get quick feedback on your resume from volunteer reviewers before career fair season.',
    categories: [8],
    registrationType: 'external',
    registrationUrl: 'https://register.example.test/resume-workshop',
    createdBy: 3,
    occurrences: dates(['2026-10-20 17:00', '2027-02-09 17:00'], {
      minutes: 60,
      virtualUrl: 'https://meet.example.test/resume-workshop',
    }),
  },
  {
    n: 6,
    title: 'Winter Orchestra Concert',
    description: 'The campus orchestra performs a program of seasonal favorites. Tickets required.',
    org: 5,
    categories: [1, 2],
    registrationType: 'external',
    registrationUrl: 'https://tickets.example.test/winter-concert',
    isFree: false,
    featuredRank: 3,
    venue: 4,
    source: { type: 'localist', externalId: 'seed-localist-evt-6001', url: 'https://calendar.example.test/event/winter-concert' },
    occurrences: dates(['2026-12-05 19:30', '2026-12-06 15:00'], { minutes: 120 }),
  },
  {
    n: 7,
    title: 'Homecoming Basketball Scrimmage',
    description: 'Meet the team and watch an intrasquad scrimmage. Free giveaways for the first 200 fans.',
    categories: [3],
    createdBy: 1,
    venue: 3,
    occurrences: dates(['2026-09-19 14:00'], { minutes: 120 }),
  },
  {
    n: 8,
    title: 'Welcome Back Block Party',
    description: 'Food trucks, a DJ and student group tables to kick off the semester.',
    org: 4,
    categories: [6, 5],
    createdBy: 5,
    occurrences: dates(['2026-09-04 17:00'], {
      minutes: 240,
      locationName: 'North Pleasant Street (closed to traffic)',
    }),
  },
  {
    n: 9,
    title: 'Library Book Sale',
    description: 'Thousands of donated books, records and puzzles. Proceeds support library programs.',
    org: 4,
    categories: [6, 2],
    venue: 6,
    occurrences: dates(['2026-11-07 00:00', '2026-11-08 00:00'], { minutes: 24 * 60, allDay: true }),
  },
  {
    n: 10,
    title: 'Chess Club Open Night',
    description: 'Casual games, puzzles and a short lesson for beginners. Boards provided.',
    org: 6,
    categories: [3],
    venue: 2,
    source: { type: 'campus_pulse', externalId: 'seed-pulse-evt-10001', url: 'https://pulse.example.test/event/chess-open-night' },
    occurrences: weekly({ start: '2026-10-07 18:30', count: 8, minutes: 150 }),
  },
  {
    n: 11,
    title: 'Mindful Mornings Yoga',
    description: 'An all-levels flow to start the week. Mats available. Signed-in members only.',
    categories: [7],
    visibility: 'authenticated',
    createdBy: 4,
    venue: 1,
    occurrences: weekly({ start: '2026-10-05 07:30', count: 8, minutes: 60 }),
  },
  {
    n: 12,
    title: 'Spring Arts Showcase',
    description: 'Draft listing for the spring student arts showcase. Details to be confirmed.',
    categories: [2],
    status: 'draft',
    createdBy: 3,
    venue: 4,
    occurrences: dates(['2027-04-17 18:00'], { minutes: 180 }),
  },
  {
    n: 13,
    title: 'Outdoor Movie Night',
    description: 'A family-friendly screening on the Common. Cancelled due to the forecast.',
    org: 4,
    categories: [2, 6],
    status: 'cancelled',
    createdBy: 5,
    venue: 5,
    occurrences: dates(['2026-10-30 19:00'], { minutes: 150, status: 'cancelled' }),
  },
  {
    n: 14,
    title: 'Spring Fling Concert',
    description: 'The end-of-year concert has been postponed. A new date will be announced.',
    categories: [1],
    status: 'postponed',
    registrationType: 'external',
    registrationUrl: 'https://tickets.example.test/spring-fling',
    isFree: false,
    venue: 3,
    occurrences: dates(['2027-05-01 17:00'], { minutes: 300, status: 'postponed' }),
  },
  {
    n: 15,
    title: 'Senior Send-Off Reception',
    description: 'Archived listing from last spring.',
    categories: [6],
    status: 'archived',
    createdBy: 4,
    venue: 1,
    occurrences: dates(['2026-05-14 16:00'], { minutes: 120 }),
  },
  {
    n: 16,
    title: 'Faculty Lunch and Learn',
    description: 'Private planning session. Not shown in the public feed.',
    categories: [4],
    visibility: 'private',
    createdBy: 3,
    venue: 1,
    occurrences: dates(['2026-11-12 12:00'], { minutes: 60 }),
  },
];

// Bookmarks and RSVPs reference users by `n` and occurrences by event `n` plus
// the 1-based occurrence index within that event.
export const bookmarks = [
  { user: 1, event: 1 },
  { user: 1, event: 3 },
  { user: 2, event: 6 },
  { user: 5, event: 3 },
  { user: 6, event: 9 },
];

export const rsvps = [
  { n: 1, user: 1, event: 2, occurrence: 9 },
  { n: 2, user: 2, event: 4, occurrence: 2 },
  { n: 3, user: 6, event: 2, occurrence: 10, status: 'cancelled' },
  { n: 4, user: 5, event: 4, occurrence: 2 },
];
