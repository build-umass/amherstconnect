# A10: dev Localist scheduling and monitoring

## Boundary and approval

The separate hosted runner targets only `https://qcoqrutsrjfxcwhplrhi.supabase.co`
(amherst-connect-dev) with a project-scoped service-role JWT. Existing local CLIs
retain their loopback-only guard. No mobile/Auth/Expo changes or credentials belong
here. Nothing has been applied to hosted dev by this implementation.

The workflow is manual-only. The sheet's 30–60 minutes and PRD's 12 hours remain
unresolved. After agreement add `on.schedule` on the default branch and explicitly
choose its write-mode policy. The current workflow rejects missing/unknown modes;
merely uncommenting a cron does not authorize writes. Agree the stale threshold
and unattended Environment approval policy at the same time.

## Preflight and mapping

Both CLI modes are explicit: `--check-only` or `--write`; omission stops.
Preflight reads database history, validates all eight approved categories, fetches
the bounded real source window, adapts it, resolves encountered organization/venue
identities and validates drafts. It never acquires a lease or writes records.

A08's approved local catalog is read as reference metadata only. No catalog rows
are uploaded. Categories require matching existing slugs and names. Organization
and venue candidates require approved source identities and matching existing
rows; missing/ambiguous/unapproved identities reject only affected events.
Reports include source event IDs, mapping identities, issue codes and paths for
review. No arbitrary aliases, category fallbacks or automatic entity creation.
Rooms remain occurrence-specific and audience metadata remains separate.

## Status and freshness

The complete 30-day window must be fetched before any event writes. The runner
bounds requests to 20 pages and rejects changing pagination totals, malformed
wrappers, failed later pages or page-cap exhaustion. No truncated fetch is fresh.

- Complete fetch with valid imports and routine record rejections: `completed`;
  advances last-success freshness. Review rejection counts separately.
- Complete valid empty feed: `completed`, classification `valid-empty`. Missing
  records do not imply cancellation. The normal expiry sweep can still run.
- Nonempty feed where every record is rejected: `failed`, classification
  `complete-all-rejected`. Preserves the prior freshness timestamp.
  Preflight remains read-only and reports the same classification.
- Review `rejectionCounts` by reason code and use `mappingReview` to find the
  affected source records. Each record contributes at most once per reason code.
- Incomplete source, database failure or lease loss: `failed`; preserves the previous
  successful timestamp. Already committed event writes are not undone across events.

`localist_sync_runs` stores attempts/counts; linked A08 import runs and per-record
outcomes supply authoritative write counts, including committed writes whose
responses were lost. Outcome reads are paginated. If failure recovery cannot read
those outcomes, write counts are null (unknown), never falsely zero. Reports retain
original failure phase and a separate cleanup-failure flag. Counts include fetched,
accepted, created, updated, unchanged, stale, rejected and failed records. Run
failure status must be checked independently of failed-record count.

The provisional freshness warning is 26 hours or no successful run. GitHub step
summaries, failed-job notifications and sanitized 14-day artifacts expose status.
Scheduling is disabled, so freshness checks currently run only when manually
requested. Enable maintainers' GitHub failure notifications; there is no hidden
always-running monitor or extra notification service.

## Leases, retries and failures

GitHub concurrency serializes workflow runs. A database advisory-locked lease
expires after 15 minutes. Acquisition marks abandoned owners failed. A fenced RPC
locks and checks the owning lease around each atomic A08 event write; triggers also
fence linked import-run mutations and outcome inserts. An expired/replaced owner
cannot keep writing, including through the original A08 function for its linked run.
Manual/local A08 runs without a hosted sync ID remain unaffected.

One ten-minute AbortSignal bounds source requests, database requests, retries and
backoff. Individual requests are capped at 20 seconds. Cleanup/reconciliation has
its own shared 15-second budget and cannot perform event writes. Transient reads
retry at most twice. Ordinary POST writes never replay automatically. Finalization
is idempotent for identical status/counts and can retry after a lost response;
conflicting finalization is rejected. A completed finalization recovered from the
database is reported accurately. Workflow timeout is twelve minutes.

## GitHub setup and first manual hosted runs (after review)

1. Review/merge the implementation to dev. Separately register only the workflow
   on main (current default) through review. Manual dispatch requires registration
   there; do not change main as part of this implementation.
2. Create Environment `amherst-connect-dev-importer`, restrict execution to main,
   and require a TL reviewer for initial runs. Protect dev through PR review.
3. Store only the existing dev service-role JWT as Environment secret
   `LOCALIST_SERVICE_ROLE_KEY`. URL is fixed public configuration. No database
   password, cloud access token, Firebase/Expo key or GitHub App is required.
4. Check hosted drift/dry-run, then separately approve/apply only the new A10
   monitoring/fencing migration through the normal migration process. Never reset
   or load local seed/catalog rows into hosted dev.
5. Dispatch `Localist dev sync` on main with mode `preflight`. The uncredentialed
   `resolve` job displays the exact current dev SHA. Inspect that commit before
   approving the Environment gate. The credentialed job checks out that immutable
   SHA and runs without npm installation or lifecycle scripts.
6. Inspect source completeness, existing categories, rejection/mapping review and
   freshness. Resolve required category/migration/configuration failures first;
   optional missing identities are record rejections, not global blockers.
7. Dispatch again with explicit mode `write`. Review the newly resolved SHA and
   approve that run. Inspect telemetry, counts, source dates and canonical IDs.
   Repeat the import to verify unchanged IDs; actual source changes can produce
   legitimate updates. Re-run preflight to inspect last-success freshness.

No npm install is required in the credentialed job: Node 24 runs the importer and
shared TypeScript contracts directly; all runner imports use built-in modules.
The Expo patch bot and its credentials remain completely independent.

## Local checks

`npm run verify` includes deterministic runner/deadline tests and preserves all
existing checks. `npm run supabase:verify` replays local migrations, pgTAP and public
schema lint. On a full isolated local REST stack, run:

```sh
node --test tests/importer/hosted-localist.integration.mjs
```

This feeds deterministic Localist pages through the actual fetcher, adapter,
mappings, A08 importer, fenced RPC and local PostgreSQL. It covers partial catalogs,
mixed outcomes, valid empty results, failed later pages, cap exhaustion, partial
writes, lost finalization responses, lease replacement and repeated import IDs.
The production target restriction is preserved; a test-only network adapter sends
all credentialed requests to loopback, never hosted dev.

The lease regression first proves valid create/update requests succeed through
both the hosted wrapper and original A08 RPC. It then asserts SQLSTATE `55P03`
and the lease-loss message for otherwise valid writes after expiry, both before
and after replacement. Full local content/state/outcome snapshots prove rollback;
linked import-run updates are checked against the same specific lease error.


## Event lifecycle

After the A09 migration, a successful sync sweeps stored provider events for
expiry even if the source window is empty or all payloads are unchanged.
Published events expire one day after their last occurrence. Failed syncs do
not run the sweep. Manually overridden events are left intact.

If a provider cancellation conflicts with an override, the import preserves
the override and records `manual_override_cancellation_conflict` in
`event_import_records.issues` for operator review.
