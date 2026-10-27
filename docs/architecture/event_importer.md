# Local event importer (A08)

The importer accepts complete JSON `AdapterEventDraft` records from the committed
F11 contract. The Localist integration passes successful `AdapterResult.value` records to
`importDrafts` in `scripts/importer/importer.mjs`. Do not pass raw Localist JSON,
formatted mobile events, or failed adapter results. The opt-in command below
connects the merged adapter/fetcher to this importer. No mobile data source changes.

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
Localist integration and local live-source acceptance are implemented below.
Production mapping approval, other source windows, and deployment remain separate.

## Bounded Localist import (local database only)

Start and reset a local stack, then run from the repository root:

```sh
npx supabase start
npx supabase db reset --local
npm run import:localist -- --start 2026-10-27 --end 2026-10-28 --page-size 5 --mappings scripts/importer/localist-local-catalog.json --setup-local-catalog
```

The import command is also valid in Windows PowerShell. Windows runtime execution
has not been independently verified. Omit `--setup-local-catalog` when using your
own reviewed mappings to existing catalogs. Without that explicit flag, imports
never create categories, organizations or venues. Setup inserts only the exact
reviewed rows and refuses to overwrite conflicting rows. It is repeatable but not
an atomic catalog-wide operation; on conflict, inspect any rows already inserted.

The provider is fixed to [UMass Localist](https://events.umass.edu/api/2/events).
The existing `fetchLocalistEvents` date-window/pagination behavior is reused;
this runner additionally caps windows at 31 days, requests at 20 pages, and total
fetch time at 60 seconds. Narrow the window if a bound is exceeded. Fetching
finishes before content writes begin. There are no scheduled or hosted imports.

Summary definitions:

- `fetched`: provider records returned by the existing paginated fetcher.
- `accepted`: records passing the adapter, JSON-shape and F11 validation.
- `rejected`: malformed/invalid source records; structured issues are reported,
  no content is written, and later valid records continue.
- `imported`: `created` + `updated` records from the existing importer.
- `unchanged` and `stale`: retries or older source updates that do not change content.
- `failed`: accepted drafts ending in `invalid`, `unresolved` or database `failed`.

Rejected source records are reported separately from durable importer outcomes.
If no drafts pass validation, no import run is created. Source warnings are also
reported. The CLI exits 1 for any rejected or failed record, **after** processing
valid drafts; inspect its summary rather than treating exit 1 as total rollback.
Provider/transport interruption is a controlled CLI error, not a success summary.
No raw provider descriptions, Auth responses or keys are logged by this command.

## Reviewed sample catalog and outstanding product mappings

`scripts/importer/localist-local-catalog.json` is an explicit, local-only sample,
not a production migration or replacement seed. Its provenance is the public
2026-10-27 through 2026-10-28 query inspected on 2026-10-26, using `pp=5` and both
pages. It records 17 verbatim source category labels, six source organization IDs,
and eight venue IDs/URLs from the eight accepted events. Stable local UUIDs and
slugs are identifiers only, not invented provider identities. Existing fake seed
catalogs have no approved mappings for these identities and are not reused.

No fuzzy matching, category conflation or fallback category is performed. The
adapter currently includes audience/topic/type labels and selects its primary
category from event types. The sample deliberately preserves those labels
one-for-one so acceptance does not silently decide the production taxonomy.
Required unresolved mappings yield an `unresolved` outcome with no partial event.

The sample venue names/rooms are the observed adapter candidates keyed by source
venue ID. Building-versus-room modeling and aliases need review before wider use.
Catalog addresses/coordinates are not invented; source location names and
coordinates remain on imported occurrences through the existing importer.

Technical Lead approval remains necessary for:

- Production categories versus audiences/topics, primary-category policy, and
  any aliases to existing categories.
- Organization identity/alias approval and venue building/room normalization.
- Handling source records without enough physical/virtual location information.
  Current behavior rejects them rather than fabricating a venue or meeting URL.
- Catalog expansion for additional windows. Unknown candidates must be reviewed;
  do not automatically create new categories from arbitrary provider text.

External ticket links remain external. Localist attendance/registration flags do
not create internal RSVPs. This integration does not remove mock app data or wire
Home, Event Details, Map or mobile authentication to Supabase.

## Verification: offline versus explicit live acceptance

```sh
npm run test:event-contract
npm run test:importer
npm run test:importer:local
npm run test:localist:live
npx supabase stop
npm run supabase:verify
npm run verify
git diff --check
```

`test:importer` includes deterministic, offline pagination/adapter/orchestration
and mapping tests and runs in regular verification. `test:importer:local` needs a
freshly reset full local stack. `test:localist:live` additionally reads the public
network, creates the opt-in sample catalog, and expects no previous real sample
import. Reset your disposable local database before rerunning it. It is **not**
part of CI or offline verification. Never run it against a hosted database.

Live acceptance imports the bounded source window, retries the frozen canonical
drafts, compares full content/UUID/count snapshots, updates and restores one local
event, exercises invalid/unmapped/SQL-failure rollback, and signs in as an existing
fake seed account to verify RLS reads. It also checks anonymous read/client write
denial and invokes the real CLI. Keys and session tokens stay in process memory.
The source may change; a new unmapped candidate or source outage should fail this
opt-in check and trigger review, not change the offline test expectations.

Verified on 2026-10-26: two pages, 10 fetched, 8 accepted/created, 2 rejected for
`invalid_location`, 0 import failures; eight events and eight occurrences. Frozen
retry and a second CLI fetch returned eight unchanged events. One controlled
update and restore, two invalid drafts, one unresolved mapping and one SQL collision
proved no duplicates/partial content. The ordinary session read all eight eligible
events; anonymous reads and authenticated content creation were denied. One real
external registration URL was preserved. These are local results, not a guarantee
of production taxonomy coverage, source uptime, or deployed application behavior.
