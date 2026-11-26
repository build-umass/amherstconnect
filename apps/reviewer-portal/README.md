# BUILD reviewer portal

Applications uses Supabase reviewer RPCs for its queue, details and approval or
rejection. Approval creates organizer publishing access and an initial shared
weekly cap of three through the existing backend transaction. Rejection requires
a reason. A successful decision reloads the corresponding status queue and details.

Organizers, Listings and Audit Log remain labeled sample sections for AC-134.
Their actions affect only in-memory fixtures and reset on reload.

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

The queue supports pending, approved, rejected, revoked and withdrawn filters.
The backend limits each filtered queue to 500 rows; the portal displays a notice
at that boundary. Reviewer checks from the former application fixtures are not
stored by the backend. Existing cap changes, revocation and moderation remain
AC-134 work.

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
```

This loopback-only integration check creates disposable local fixture accounts.
It checks actual login, private detail access, rejection, approval, membership,
cap initialization, persistence and nonreviewer/anonymous denial. Stop or reset
only the isolated stack you used after testing.

## Cloudflare Pages

Use `apps/reviewer-portal` as the root, `npm run build` as the build command,
and `dist` as output. Set Node to 24 and provide only the Supabase URL and public
client key. Privileged credentials are never part of the portal build.
