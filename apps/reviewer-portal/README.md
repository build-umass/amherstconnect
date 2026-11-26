# BUILD reviewer portal

Applications uses Supabase reviewer RPCs for its queue, details and approval or
rejection. Approval creates organizer publishing access and an initial shared
weekly cap of three through the existing backend transaction. Rejection requires
a reason. A successful decision reloads the corresponding status queue and details.

Organizers, Listings and Audit Log use the merged tables and reviewer-only
operations. Organizers shows approved organizers, their current cap and private
contact, plus readable published events and activity. Listings shows published
organizer events and supports individual removal with confirmation. Audit Log
shows stored timestamps, actor profile IDs, actions and subject IDs.

The merged backend does not yet supply revocation, cap adjustment, deals,
bulk removal or config controls. The portal explains those unavailable actions.
It never falls back to sample data when a live request fails.

## Run locally

Use Node 24. From `apps/reviewer-portal`:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to your local
Supabase API and public client key. Sign in with an existing local
email/password account with active `content_reviewer_memberships`.
The portal verifies `is_content_reviewer`; the database independently checks each
reviewer RPC. Ordinary accounts are denied. Private contact information comes
only from the authorized reviewer responses. Session changes invalidate pending
UI responses and authorization checks.

## Database dependency

Task 1.2 migration `202611220002_organizer_application_decisions.sql` supplies
`reviewer_list_organizer_applications`, `reviewer_get_organizer_application`,
`approve_organizer_application` and `reject_organizer_application`. PR #63
includes the existing AC-121 contributor commit without duplicating its backend.
Apply the committed migrations in order to an isolated local stack before testing.
Hosted rollout requires separate approval.

The application queue supports pending, approved, rejected, revoked and withdrawn
filters. Each queue/management read is limited to 500 rows with a limit notice.
Reviewer checks from the former application fixtures are not stored by the backend.

## AC-134 dependencies

Verified against dev at 74207b5. No database changes are included.

| Feature | Available interface | Remaining work |
| --- | --- | --- |
| Organizers, private contacts and cap reads | organizers, organization_contacts, organizer_publishing_settings under existing RLS | None for displayed reads |
| Event removal | remove_organizer_event(p_event_id) | This RPC archives a published app-created event and records event_update; it accepts no removal reason |
| Audit reads | audit_log under reviewer RLS | Human-readable actor names need an authorized profile read model |
| Organizer revocation | Task 1.3 branch remains unmerged | Merge and review its revoke_organizer operation before connecting it |
| Cap changes and config | No merged mutation API | Task 2.3 operations |
| Deals, bulk removal and hidden listing history | No merged deal/moderation read/write API | Task 2.3 operations and student-view verification |

Current event reads honor the existing client RLS: the page is a published-event
moderation view, not an exhaustive listing-management queue. Imported Localist
events are excluded. Removal preserves event IDs, bookmarks and organizer access.
It changes status to archived; the UI does not claim a removal reason was saved.
The broader deals lifecycle remains owned by its backend task.


## Verification

```sh
npm --prefix apps/reviewer-portal test
npm --prefix apps/reviewer-portal run build
npm run verify
npm run supabase:verify
```

For an isolated local stack with migrations applied, run from the repository root:

```sh
node apps/reviewer-portal/integration/applications.mjs
node apps/reviewer-portal/integration/management.mjs
```

This loopback-only integration check creates disposable local fixture accounts.
It checks actual login, private detail access, rejection, approval, membership,
cap initialization, persistence and nonreviewer/anonymous denial. The management
check additionally verifies event removal, student visibility, audit attribution,
unchanged membership/cap and Localist protection. Stop or reset
only the isolated stack you used after testing.

## Cloudflare Pages

Use `apps/reviewer-portal` as the root, `npm run build` as the build command,
and `dist` as output. Set Node to 24 and provide only the Supabase URL and public
client key. Privileged credentials are never part of the portal build.
