// Entirely fake, deterministic F11 input. No unmerged provider fixtures needed.
export const mappings = {
  categories: { campus: 'd0000000-0000-4000-8000-000000000006', arts: 'd0000000-0000-4000-8000-000000000002' },
  organizations: { 'localist:id:group-a08': 'b0000000-0000-4000-8000-000000000001' },
  venues: { 'localist:id:venue-a08': 'c0000000-0000-4000-8000-000000000001' },
};
export function draft() {
  return {
    sourceType: 'localist', externalId: 'a08-test-event', sourceUrl: 'https://calendar.example.test/event/a08',
    sourceUpdatedAt: '2026-10-26T12:00:00Z', title: 'A08 Test Concert', description: 'Fictional importer test.',
    imageUrl: null, organization: { name: 'Test organization', externalId: 'group-a08', sourceUrl: null },
    categoryLabels: ['Campus', 'Arts'], primaryCategoryLabel: 'Campus', status: 'published', visibility: 'public',
    timezone: 'America/New_York', registrationType: 'none', registrationUrl: null, isFree: true, featuredRank: null,
    occurrences: [1, 2].map(n => ({
      sourceType: 'localist', externalId: `a08-test-instance-${n}`, startsAt: `2026-11-0${n}T22:00:00Z`,
      endsAt: `2026-11-0${n}T23:00:00Z`, allDay: false, status: 'scheduled', locationType: 'physical',
      locationName: 'Test hall', coordinates: { latitude: 42.3912, longitude: -72.5267 }, virtualUrl: null,
      sourceAttendanceCount: 0, sourceUpdatedAt: '2026-10-26T12:00:00Z',
      venue: { name: 'Test hall', externalId: 'venue-a08', sourceUrl: null, room: null, addressLine1: null,
        addressLine2: null, city: null, region: null, postalCode: null, countryCode: null, coordinates: null },
    })),
  };
}
