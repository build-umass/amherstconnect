# Event Search and Filters (E04)

## Purpose

Home and Search load events from one database function, `public.event_feed_filtered`, built in E02. E04 extends it so search and every filter run in the database: text search, dates, categories, organizations, and free or paid events. The app never filters events on the device.

## Database

### `event_feed_filtered`

Migration: `supabase/migrations/202611070002_event_search_filters.sql`

| Parameter | Type | Meaning |
| --- | --- | --- |
| `p_from` | `timestamptz` | Required. Shows events that are not over at this time. |
| `p_until` | `timestamptz` | Only events starting before this time. Null means no end. |
| `p_category_slugs` | `text[]` | Any of these categories, as the primary or a secondary category. |
| `p_search` | `text` | Matches title, location/venue name, or organizer name. |
| `p_organization_ids` | `uuid[]` | Any of these organizations. |
| `p_is_free` | `boolean` | True for free, false for paid, null for either. |
| `p_after_starts_at`, `p_after_event_id` | cursor | The last row received, to get the next page. Pass both or neither. |
| `p_limit` | `integer` | Page size, 1 to 100. Default 20. |

Rules:

- Different filters combine with AND. Values inside one list combine with OR.
- Null, empty lists, blank slugs and blank search are ignored.
- Search is case-insensitive and trimmed, uses at most 100 characters, and treats `%` and `_` as plain text.
- One row per event, at its next scheduled time. Results are sorted by start time, then event ID.
- Only published events with scheduled occurrences appear. The function runs as the calling user, so row-level security also hides private and draft events.
- Price is only free or paid, because events store `is_free` and no amount.

The original RPC stays available for installed clients. The filtered RPC uses `p_category_slugs text[]`.

### `event_feed_organizations`

Migration: `supabase/migrations/202611070003_event_feed_organizations.sql`

Returns `(organization_id, name)` for the organization filter, sorted by name. It lists only organizations with an upcoming event that `event_feed` would show, so every choice has results. `p_from` defaults to `now()`.

Both functions are available to signed-in users only.

## Mobile

- `apps/mobile/src/services/eventRepository.ts`
  - `FeedFilters`: `categorySlugs`, `organizationIds`, `isFree`, `search`, `from`, `until`.
  - `listFeed(filters, cursor, limit)` calls `event_feed_filtered`.
  - `listOrganizations()` calls `event_feed_organizations` and returns `{ id, name }[]`.
- `apps/mobile/src/hooks/useEventFeed.ts` takes the same filters. It reloads from the first page when a filter value changes, but not when a screen passes a new array with the same items (see `feedFiltersKey` in `services/eventFeed.ts`). Search waits 300 ms after typing stops.

```ts
const feed = useEventFeed({
  categorySlugs: ['music', 'arts-culture'],
  organizationIds: [selectedOrgId],
  isFree: true,
  search: 'jazz',
  until: endOfWeek,
});
```

## Tests

- Database: `supabase/tests/database/event_feed.test.sql` (`npx supabase test db`)
- Mobile: `apps/mobile/tests/eventRepository.test.mjs`, `eventFeed.test.mjs` (`cd apps/mobile; npm test`)

## Performance

The filtered RPC adds indexed PostgreSQL full-text matching on event title and description while retaining literal substring matches on title, venue and organizer. Results keep chronological keyset pagination.
