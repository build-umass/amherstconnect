# Canonical Event and Source Contract

## Purpose

`shared/contracts/event.ts` is the single provider-neutral contract for imported events, Supabase repositories, and mobile event features. It mirrors the deployed event foundation without adopting the current UI model's formatted `date`, `time`, `location`, `emoji`, or Firestore timestamp fields.

The contract has two boundaries:

1. A provider adapter converts one raw source record into a validated `AdapterEventDraft`.
2. An importer maps organization, category, and venue candidates to database IDs, upserts event and occurrence rows, and repositories return `CanonicalEvent` aggregates.

Raw provider payloads never become mobile models or database rows directly.

## Why events and occurrences are separate

An event represents the shared concept: title, description, organizer, categories, image, visibility, registration mode, source identity, and publication status. An occurrence represents one scheduled instance: start/end, all-day state, occurrence status, venue/location, coordinates, virtual URL, and source attendance.

This separation supports recurring events without copying shared metadata, lets an individual occurrence be cancelled or postponed, and allows RSVPs to target the actual scheduled instance while bookmarks continue to target the conceptual event.

## Provider record to canonical event

```text
raw provider record
  → provider adapter
  → validated AdapterEventDraft
  → configurable category/organization/venue mapping
  → idempotent event + occurrence upsert
  → repository CanonicalEvent aggregate
  → screen-specific display formatting
```

Adapters must:

- preserve the stable provider event ID and occurrence/instance ID;
- emit UTC ISO-8601 instants ending in `Z` plus an IANA display timezone;
- emit one occurrence per provider instance;
- normalize descriptions to plain text and never pass provider HTML through as canonical content;
- use `null` for unavailable optional fields rather than fabricated values;
- reject/quarantine records missing a stable imported identity, title, valid timezone, category candidate, valid occurrence, or required registration/location data;
- report malformed optional URLs, coordinates, and source metadata instead of guessing.

For all-day events, adapters convert source-local calendar boundaries using the event timezone. `startsAt` is the UTC instant for the local start boundary and `endsAt` is the exclusive UTC instant for the next boundary. It must not be represented as a formatted date string.

## Identity, deduplication, and updates

- Imported events are identified by `(sourceType, externalId)`.
- Imported occurrences are identified independently by `(sourceType, externalId)`.
- Every occurrence uses the same `sourceType` as its parent event. Cross-provider occurrences are invalid.
- Amherst Connect-created records may have a null external ID and use their internal UUID.
- External IDs are never navigation IDs or foreign keys in mobile features.
- If a provider lacks a standalone occurrence ID, the adapter must derive a deterministic ID from stable upstream identity data. Titles, descriptions, and mutable formatted times are not acceptable identities.
- Re-importing the same source identity updates the existing row. It does not insert a duplicate.
- `sourceUpdatedAt` supports stale-update rejection when the provider supplies a reliable timestamp. Import bookkeeping and payload hashes belong to the importer, not this event contract.
- A missing source record is not immediately a cancellation. Import policy must use a reviewed absence threshold before cancelling or expiring it.

Event-level cancellation/postponement affects every occurrence. Occurrence-level cancellation/postponement affects only that instance. Draft and archived events are unavailable to clients. Status is explicit and must not be inferred from title text.

## Locations and mappings

Location validation intentionally mirrors `event_occurrences_location_fields_valid` in the deployed SQL migration:

- Physical occurrences require a venue candidate, nonblank location name, or coordinates and must have a null virtual URL.
- Virtual occurrences require a virtual URL and must have null venue and coordinates. SQL permits a descriptive `locationName` for virtual occurrences, so the contract permits it too.
- Hybrid occurrences require a virtual URL plus a venue candidate, nonblank location name, or coordinates.

Coordinates use `{ latitude, longitude }` in TypeScript. Persistence must write PostGIS points in longitude/latitude order. Venue candidates should be matched through provider IDs first, then reviewed aliases; adapters must not create venue UUIDs.

Category labels and organization/venue candidates preserve source meaning. Category labels cannot be blank and must be unique after trimming, whitespace folding, and case normalization. The primary category must match one category under that same normalization. The importer owns configurable mappings to canonical database IDs. Unknown labels should enter a reviewable mapping path rather than silently becoming arbitrary categories. Every persisted event requires one primary category, which must also be included in its category set.

## F14 fixture requirements

Representative Localist fixtures must preserve the raw fields needed to test:

- stable event and instance IDs;
- source and update URLs/timestamps;
- single and recurring schedules;
- explicit UTC offsets, daylight-saving boundaries, and all-day dates;
- missing optional end times, images, descriptions, organizers, coordinates, and attendance;
- physical, virtual, and hybrid locations;
- multiple categories and unmapped category labels;
- free/paid and internal/external/no-registration cases when available;
- cancellation and postponement signals;
- HTML descriptions and malformed optional data.

Fixtures must be sanitized, minimal, deterministic, and retain provider field names and nesting. They must not contain credentials, private attendee data, or invented fields.

## A01 Localist adapter acceptance boundary

A01 must implement `EventSourceAdapter<LocalistRawRecord>` and return `AdapterResult`. A successful result contains one `AdapterEventDraft` with one or more occurrences and no database IDs. A failed result contains structured issues and produces no partial database write.

The adapter is responsible for Localist field parsing, timestamp conversion, status conversion, plain-text normalization, and source candidate extraction. It is not responsible for database access, UUID creation, category taxonomy decisions, venue alias approval, deduplication writes, screen formatting, bookmarks, or RSVPs.

## Fixed decisions

- Events and occurrences are separate.
- Bookmarks reference events; RSVPs reference occurrences.
- Canonical timestamps are UTC ISO-8601 instants; display timezone is IANA.
- Recurrence is represented by separate occurrences, not recurrence text.
- Imported source identity is mandatory and provider-scoped.
- Descriptions are stored as normalized plain text.
- Location and registration modes match the deployed SQL constraints.
- Cancellation and postponement are explicit at event and occurrence levels.
- Canonical records do not contain UI-formatted date/time strings, emoji, or Firestore types.

## Configurable mappings and importer policy

The following remain configurable and do not change the contract:

- source category label to canonical category mapping;
- organization and venue alias mapping;
- default category for reviewed unmapped records;
- visibility and registration mappings when a provider omits them;
- handling of unsupported/malformed optional fields;
- the absence threshold before a missing source record is cancelled or expired;
- image selection when a provider supplies multiple renditions;
- which records qualify for featured placement. Adapters do not assign `featuredRank` unless an approved source policy explicitly does so.
