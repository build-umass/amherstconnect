# Local event importer (A08 database portion)

The importer accepts complete JSON `AdapterEventDraft` records from the committed
F11 contract. A01 will pass successful `AdapterResult.value` records to
`importDrafts` in `scripts/importer/importer.mjs`. Do not pass raw Localist JSON,
formatted mobile events, or failed adapter results. No provider adapter or network
fetching is included here.

## Local use

From the repository root after the normal clean installs:

```sh
npx supabase start
npx supabase db reset --local
npm run test:importer
npm run test:importer:local
npm run import:events -- drafts.json mappings.json
npx supabase stop
```

Reset destroys local data and reapplies migrations/seeds. Start the full stack
for the REST integration test and CLI; the reduced CI database stack intentionally
excludes REST. The database tests also run under `npm run supabase:verify`.
Offline importer tests run under regular `npm test` and `npm run verify`.

`drafts.json` is a nonempty array of drafts from one external source. The CLI reads
the running local stack's URL and privileged key using the pinned CLI's status
command **inside the process**, without printing them. Only loopback endpoints
are accepted and redirects are forbidden. No cloud login/link/hosted credentials
are needed. Commands work in macOS/Linux shells and Windows PowerShell; Windows
execution has not been independently tested.

## Explicit mappings

`mappings.json` contains `categories`, `organizations`, and `venues` objects whose
values are UUIDs of existing database records. Populate catalogs through an
approved privileged workflow first; this importer never invents or creates them.

- Category keys: source label trimmed, whitespace folded, and lowercased.
- Organization/venue keys with source IDs: `localist:id:<externalId>`.
- Without a source ID: `localist:name:<normalized candidate name>` is an explicit
  operator-approved alias. There is no fuzzy matching or automatic name fallback
  when an ID was supplied.
- Several approved labels may map to one category UUID. The mapped primary
  category must be in the deduplicated category relationship set.
- A null organization/venue candidate stays null. A supplied unresolved candidate
  fails with `unresolved_mapping`, even if that relationship is nullable in SQL.

`tests/importer/drafts.mjs` exports an entirely fake draft and mappings to the
deterministic F09 seed catalogs. It is an executable example, not production data.
No key or database connection belongs in mapping/input files or mobile code.

## Persistence and safety

Only `service_role` may execute the invoker-privilege import RPC; ordinary Auth
users and anonymous clients receive no new content/bookkeeping write grants.
Strict JSON shape/type validation runs before F11 semantic validation and mapping.
Nullable fields must be explicit; strings are never coerced to numbers or booleans.
Malformed drafts receive an `invalid` outcome and do not prevent later valid
records in that batch from importing. The privileged RPC is an internal boundary,
not an alternate unvalidated mobile endpoint. SQL constraints provide additional
defense; it must be called through the validated importer.

Each record writes the event, category links, occurrences and hash state in one
database subtransaction. Errors roll back content and persist a sanitized outcome
outside that subtransaction. Runs/outcomes store hashes and issue codes, not full
provider payloads. Outcomes are `created`, `updated`, `unchanged`, `stale`,
`invalid`, `unresolved`, or `failed`; any failed record makes the run failed.
Runs include the expected record count so missing outcomes can be identified.
Process interruption may leave a run `running`; operators must inspect it before
marking it failed. Retrying through a new run is idempotent. Transport errors do
not imply rollback of a request that already committed.

Provider event and occurrence identities preserve internal UUIDs. Same-event
imports are serialized. An occurrence identity cannot be reassigned to another
event. Existing SQL forbids two occurrences of one event at the exact same start
instant; such collisions fail the entire record rather than merging identities.
Schedule uniqueness is deferred only during occurrence writes and checked before
leaving the content subtransaction. Valid moves/swaps preserve UUIDs regardless
of input order; conflicting final schedules roll back and record a failure.

Hashes include mappings and ignore object-key order. Identical reimports do not
touch content timestamps. When the database has a source update timestamp, older
or undated input is skipped. A stale occurrence skips the whole draft. Equal
timestamps permit changed content; without timestamps, arrival order governs.
Changing provider timestamps must reflect actual source metadata, not import time.

Coordinates are written in longitude/latitude order. Missing source occurrences
are retained unchanged. There is no deletion, cross-source deduplication,
cancellation-on-absence, manual override policy, scheduling, or mobile integration.
Real Localist adapter integration, mapping approval against real catalogs, and
live-source rerun/update acceptance remain necessary before all of A08 is complete.
