const people = [
  ['student-garden', 'Campus Seed Collective', 'Student organization', 'Jordan Lee', 'Events coordinator', 'garden', null,
    'We host seed swaps and beginner gardening workshops for students.', 'Events', 'Twice a month'],
  ['bookshop', 'Mill Lane Books', 'Local business', 'Robin Patel', 'Owner', 'books', '12 Example Lane, Amherst',
    'An independent bookshop planning readings and discounts for students.', 'Events and deals', 'Once a week'],
  ['bicycle-coop', 'Valley Bicycle Co-op', 'Nonprofit', 'Avery Nguyen', 'Volunteer lead', 'bikes', null,
    'Volunteer-run bicycle repair and safety workshops.', 'Events', 'Once a week'],
  ['film-society', 'Campus Film Society', 'Student organization', 'Morgan Ellis', 'Program chair', 'film', null,
    'Student-led screenings and discussions.', 'Events', 'Twice a month'],
  ['coffee', 'North Common Coffee', 'Local business', 'Jamie Ross', 'Manager', 'coffee', '18 Example Lane, Amherst',
    'A café offering student specials and open mic nights.', 'Events and deals', 'Once a week'],
  ['arts', 'Amherst Makers Guild', 'Nonprofit', 'Taylor Green', 'Director', 'makers', null,
    'Community art classes and open studio sessions.', 'Events', 'Three times a month'],
  ['outdoors', 'Campus Outdoor Programs', 'UMass department', 'Sam Rivera', 'Program coordinator', 'outdoors', null,
    'Outdoor lessons and guided outings for students.', 'Events', 'Once a week'],
  ['market', 'Meadow Lane Market', 'Local business', 'Drew Chen', 'Owner', 'market', '24 Example Lane, Amherst',
    'A neighborhood shop with seasonal specials.', 'Deals', 'Twice a week'],
  ['music', 'Town Green Music Circle', 'Other', 'Casey Brooks', 'Organizer', 'music', null,
    'Informal community jam sessions and music lessons.', 'Events', 'Once a month'],
];

export const reviewerChecks = [
  'Link opens and shows the organization',
  'Contact matches the organization',
  'Planned content fits the organizer terms',
];

const existing = new Map([
  ['bicycle-coop', ['approved', 2]],
  ['film-society', ['approved', 3]],
  ['coffee', ['approved', 5]],
  ['arts', ['approved', 0]],
  ['outdoors', ['approved', 4]],
  ['market', ['revoked', 1]],
]);

export const fixtureApplications = people.map(([id, organizationName, kind, contactName, contactRole, slug,
  address, about, postingPlans, frequency], index) => ({
  id, organizationName, kind, contactName, contactRole, address, about, postingPlans, frequency,
  email: slug + '@example.test',
  affiliationUrl: 'https://example.test/' + id,
  acceptedTerms: true,
  submittedAt: new Date(Date.UTC(2026, 10, 14 - index, 15, 30)).toISOString(),
  status: existing.get(id)?.[0] ?? (id === 'music' ? 'rejected' : 'pending'),
  rejectionReason: id === 'music' ? 'Please provide a public page that verifies your affiliation.' : null,
  checks: index >= 2 && id !== 'music' ? reviewerChecks : [],
  organizerId: existing.has(id) ? 'org-' + id : null,
}));

export const fixtureOrganizers = fixtureApplications.filter(record => record.organizerId).map(record => ({
  id: record.organizerId, applicationId: record.id, name: record.organizationName,
  cap: existing.get(record.id)[1], status: record.status,
  approvedAt: '2026-11-14T16:15:00Z', approvedBy: 'BUILD reviewer',
  revocationReason: record.status === 'revoked' ? 'The organizer is no longer maintaining its account.' : null,
}));

const listingRows = [
  ['bicycle-coop', 'Bike repair basics', 'Event', 'live', '2026-11-21T18:00:00Z'],
  ['bicycle-coop', 'Fall bike safety clinic', 'Event', 'expired', '2026-11-10T19:00:00Z'],
  ['film-society', 'Short film showcase', 'Event', 'live', '2026-11-22T00:00:00Z'],
  ['film-society', 'Outdoor film night', 'Event', 'withdrawn', '2026-11-20T00:00:00Z'],
  ['film-society', 'Documentary discussion', 'Event', 'live', '2026-11-28T00:00:00Z'],
  ['coffee', 'Student coffee bundle', 'Deal', 'live', '2026-12-15T21:00:00Z'],
  ['coffee', 'Friday acoustic open mic', 'Event', 'live', '2026-11-27T23:00:00Z'],
  ['coffee', 'September loyalty offer', 'Deal', 'expired', '2026-10-01T02:00:00Z'],
  ['arts', 'Beginner printmaking', 'Event', 'live', '2026-11-24T19:00:00Z'],
  ['arts', 'Open studio pass', 'Deal', 'removed', '2026-12-10T21:00:00Z'],
  ['outdoors', 'Trail skills workshop', 'Event', 'live', '2026-11-29T17:00:00Z'],
  ['outdoors', 'Late fall group hike', 'Event', 'withdrawn', '2026-11-30T16:00:00Z'],
  ['market', 'Student pantry bundle', 'Deal', 'removed', '2026-12-12T22:00:00Z'],
];

export const fixtureListings = listingRows.map(([organizer, title, type, status, date], index) => ({
  id: 'listing-' + (index + 1), organizerId: 'org-' + organizer, title, type, status, date,
  removalReason: status === 'removed' ? 'The listing no longer met the organizer terms.' : null,
}));

export const fixtureAudit = [
  ...fixtureOrganizers.map(organizer => ({
    id: 'approve-' + organizer.id, at: organizer.approvedAt, actor: organizer.approvedBy,
    action: 'Approved organizer', organizerId: organizer.id, applicationId: organizer.applicationId, listingId: null,
    target: organizer.name, note: 'Weekly publication cap set to ' + organizer.cap + '.',
  })),
  {
    id: 'reject-music', at: '2026-11-14T16:20:00Z', actor: 'BUILD reviewer', action: 'Rejected application',
    applicationId: 'music', organizerId: null, listingId: null, target: 'Town Green Music Circle',
    note: fixtureApplications.find(application => application.id === 'music').rejectionReason,
  },
  {
    id: 'revoke-market', at: '2026-11-15T21:15:00Z', actor: 'BUILD reviewer', action: 'Revoked approval',
    applicationId: 'market', organizerId: 'org-market', listingId: null, target: 'Meadow Lane Market',
    note: fixtureOrganizers.find(organizer => organizer.id === 'org-market').revocationReason,
  },
  ...fixtureListings.map((listing, index) => ({
    id: 'audit-' + listing.id, at: new Date(Date.UTC(2026, 10, 15, 17, index)).toISOString(),
    actor: listing.status === 'removed' ? 'BUILD reviewer'
      : listing.status === 'expired' ? 'System' : 'Organizer',
    action: { live: 'Published listing', expired: 'Expired listing', withdrawn: 'Withdrew listing', removed: 'Removed listing' }[listing.status],
    organizerId: listing.organizerId, applicationId: null, listingId: listing.id, target: listing.title,
    note: listing.removalReason,
  })),
];
