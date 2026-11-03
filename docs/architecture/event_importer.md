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

## Approved categories and explicit Localist mappings

On 2026-10-30 the Technical Lead approved exactly these app categories:
**Talks & Lectures, Workshops & Classes, Arts & Culture, Sports & Recreation,
Career & Networking, Health & Wellness, Social & Community, Food & Drink.**

`scripts/importer/localist-local-catalog.json` configures these eight records for
local acceptance, plus 25 public organization identities and 22 public places.
Arts & Culture, Sports & Recreation and Food & Drink reuse the exact matching F09 catalog UUIDs
and slugs; the other five have deterministic UUIDs. This avoids duplicate category
names and preserves existing relationships. Existing unrelated seed categories
are not deleted or renamed. Imported events can reference only the eight
configured app categories. No hosted catalog is changed by this file.

Source provenance remains the bounded public JSON queries inspected on 2026-10-29:

- [October 27–28](https://events.umass.edu/api/2/events?start=2026-10-27&end=2026-10-28&pp=50&page=1): 10 records.
- [October 29–November 4](https://events.umass.edu/api/2/events?start=2026-10-29&end=2026-11-04&pp=50&page=1): 31 records, including repeated event IDs for different occurrences.

Only public identity/label fields are retained in the catalog. No raw descriptions,
meeting links or contact details are copied into it. Organization and venue UUIDs
are unchanged from the preceding mapping candidate; no aliases were inferred.

### Source rules now implemented

Each `localistFilters` key includes dimension and source ID. Rules retain the
observed label, preventing accidental cross-dimension or renamed-label matches.
The following direct semantic matches are configured; ambiguous combined formats
and broad subjects are explicitly left for review.

| Source dimension | Observed source labels | App category / outcome |
| --- | --- | --- |
| Type | Lecture/Talk/Reading | Talks & Lectures |
| Type | Exhibit; Concert/Performance/Film | Arts & Culture |
| Type | Athletic Event | Sports & Recreation |
| Type | Career/Recruiting | Career & Networking |
| Type | Social/Fun/Activity | Social & Community |
| Type | Conference/Seminar/Workshop | Review: Talks & Lectures versus Workshops & Classes |
| Type | Meeting/Infosession | Review: format/purpose is not specific enough |
| Topic | Continuing Education | Review: educational topic does not distinguish a talk from a class |
| Topic | Arts and Culture | Arts & Culture |
| Topic | Career Development | Career & Networking |
| Topic | Health and Wellness | Health & Wellness |
| Topic | Celebration; Civic and Social Engagement | Social & Community |
| Topic | Research and Innovation; Admissions and Advising | Review: subject does not determine format |
| Topic | Diversity, Equity, and Inclusion; Global and Cultural Engagement; Sustainability | Review: broad subjects do not uniquely identify one approved category |
| Audience | Students; Faculty; Staff; Alumni; Parents; Public/Everyone | Separate audience warnings, never categories |
| Location | Any building, room, address or coordinate | Location only; never a category inference |

Food & Drink is in the approved catalog but no observed structured source label
in this sample justifies assigning it. A dining-hall venue is not enough.

A known ambiguous rule has `categoryLabel: null` plus `reviewReason`. It produces
`ambiguous_source_mapping` with the exact source key and explanation. Unknown
IDs, dimensions or labels produce `unresolved_source_mapping`. Neither is silently
dropped. If another usable category exists, an unknown or
ambiguous **topic** becomes an `unmapped_topic` warning with its source identity,
label and reason; it does not block import. Unmapped event types still require
review. Events with no usable category remain rejected (`no_usable_category`),
and multiple possible primary categories still require explicit selection.
Warnings are preserved even when a different issue rejects the record. Invalid
configured category targets are configuration failures, not optional-topic warnings.

The merged adapter and F11 contract are unchanged. `mapLocalistCandidates` runs
after adaptation and before final F11 validation/import. Raw Localist imports
always supply this mapping configuration; the generic F11 importer still accepts
validated canonical drafts independently.

### Multiple categories and one primary

All mapped type/topic categories are retained, deduplicated by normalized target
label. Several source aliases can resolve to the same app category. The explicit
`single-event-type-or-single-category` policy uses one distinct mapped type as
primary, or the sole mapped category when only one exists. It never chooses by
array order. Several distinct type categories or topic-only multiple categories
need a `primaryCategoryByEvent` source-filter-key selection. An override must
belong to the event's mapped category set. For example, Exhibit plus Performance
both map to Arts & Culture; adding Lecture introduces Talks & Lectures, so the
primary is ambiguous and remains flagged. A primary override does not bypass
unmapped event types or unresolved organizer choices; supplemental unmapped topics
are reported as warnings once a usable category exists.

### Organizations, places and remaining choices

The current schema stores one organization per event. A single source group uses
its provider ID; several distinct groups require an explicit
`organizationByEvent[eventId] = sourceGroupId` present in that event. No first-group
fallback, name guessing or automatic merge is used. These are the specific
co-host selections in the inspected sample; some also require location/category
correction before they can import:

| Source event | Organizer choice still needed |
| --- | --- |
| Bat Week `54232922640412` | CNS `50401689449719` or Biology `45704323439272` |
| Vaccine clinic `53728067997350` | Nursing `47446557113151` or UHS `53734868426842` |
| Academic project-management workshop `54301488638341` | Social and Behavioral Sciences `47424852722116` or Communication `45704323503792` |
| Book launch `54355206354522` | Economics `45704323549877` or PERI `47385306790636` |
| Attorney for international students `53417641343824` | Global Affairs `45704323660484` or SACL `45704323905249` |
| Book club `53798693413206` | Fine Arts Center `45704323936996` or UMCA `45704323946213` |

Choose the accountable publishing/organizing unit per event. The public array
order does not establish that responsibility. No organization aliases are
currently needed or justified by the evidence.

Venue source IDs identify places, not a specific event's room. Catalog rooms are
null; occurrence `locationName` preserves the building plus its own room, and
coordinates remain occurrence-specific. Campus Center `45702739081704` therefore
serves rooms 165, Amherst Room and 922 without duplicate buildings or overwrites.
The Technical Lead confirmed on 2026-10-30 that Campus Center Auditorium
`45702738934228` stays separate from Campus Center `45702739081704`. No venue
alias or further place-equivalence decision is needed for this sample.

Missing required physical/virtual/hybrid location information is still rejected
as `invalid_location`. No coordinates, room, category or meeting URL is invented.
Local catalog setup checks mapping targets and duplicate identities before writes
and refuses to overwrite conflicting rows. A previous disposable local catalog
may need a local reset before loading this corrected catalog; never reset hosted
services or another developer's stack.

Source-policy failures appear in structured `rejected` results with event ID,
code and path. Missing canonical UUID mappings remain durable `unresolved` importer
outcomes. Audience warnings do not claim durable audience storage. External
registration links remain external; no internal registration is inferred.

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
The source may change. New required mapping failures or an outage should trigger
review; supplemental topic warnings do not fail an otherwise valid import. Offline
test expectations remain deterministic.

Historical acceptance before source-aware mapping (2026-10-26): two pages, 10 fetched, 8 accepted/created, 2 rejected for
`invalid_location`, 0 import failures; eight events and eight occurrences. Frozen
retry and a second CLI fetch returned eight unchanged events. One controlled
update and restore, two invalid drafts, one unresolved mapping and one SQL collision
proved no duplicates/partial content. The ordinary session read all eight eligible
events; anonymous reads and authenticated content creation were denied. One real
external registration URL was preserved. These are local results, not a guarantee
of production taxonomy coverage, source uptime, or deployed application behavior.

### Current acceptance: supplemental-topic warning policy (2026-10-30)

All eight approved categories remain unchanged. Campus Center and Campus Center
Auditorium remain separate; unresolved organizer choices still reject.

- 37 importer tests and 35 contract/adapter tests pass.
- Local REST/CLI and bounded live-source acceptance pass, including frozen retry,
  controlled updates, rollback, primary membership, ordinary-user/anonymous RLS,
  and two room-specific occurrences sharing one unchanged building.
- October 27–28: 10 fetched, 7 accepted, 3 rejected (2 invalid locations and
  1 unresolved organizer); frozen retry returns 7 unchanged records.
- October 29–November 4: 31 fetched, 16 accepted, 15 rejected. Accepted records
  create 15 event identities and update one recurring event with another occurrence.
  Repeat import creates zero new identities and preserves occurrence UUIDs.
- The wider window reports 7 supplemental-topic warning instances. Warnings
  remain visible without creating extra category links or inventing mappings.

| Remaining rejection reason in wider window | Feed records affected |
| --- | ---: |
| Missing required physical/virtual/hybrid location information | 8 |
| Unresolved primary organizer | 5 |
| Ambiguous source type/category mapping | 2 |
| No usable category (missing source candidates or none mapped) | 2 |
| Ambiguous primary category among valid mapped categories | 1 |

Counts overlap: a record can have several blockers, so these counts must not be
summed as distinct rejections. There are 15 rejected feed records; Bat Week appears
twice in that feed. Broad topics alone do not block a categorized event anymore.

The API can return separate records for different occurrences of the same event;
a retry can update its payload hash without creating duplicate content. These
are local acceptance results, not mobile integration, hosted deployment,
cross-source duplicate matching or missing-record lifecycle verification.
