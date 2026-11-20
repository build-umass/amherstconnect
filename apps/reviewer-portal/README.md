# BUILD reviewer portal

AC-132 adds reviewer sign-in and a demo workspace for Applications, Organizers,
Listings, and Audit Log. The linked fixtures support approve/reject, publication
cap changes, revocation, and individual or bulk listing removal. Actions update
fictional records in memory and reset on reload or sign-out. No emails are sent.

## Run locally

Use Node 24. From `apps/reviewer-portal`:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the environment
you want to test. Use the public publishable key or legacy anon key. Sign in
with an existing email/password account with an active reviewer membership in
that environment. The portal checks the existing R04 `is_content_reviewer`
RPC. An ordinary account gets an access-denied screen. If the RPC is missing
or the check fails, the queue stays closed and the portal offers a retry.

## Cloudflare Pages build

Set the Pages root directory to `apps/reviewer-portal`, the build command to
`npm run build`, and the output directory to `dist`. Set Node to 24 and provide
the same two public build variables. The static build does not require Supabase
credentials in CI. Run `npm test` and `npm run build` for verification.

The fixture fields follow the Phase 2 tracker and schema workbook. AC-120 must
confirm the application field and reviewer permission contracts. AC-133 will
replace the fixture store with authenticated queue and decision operations.
The real operations must enforce reviewer permissions at the database boundary.

## Live application integration (AC-133)

The application repository defines the portal-side boundary for filtered queue
reads, detail reads, approval and rejection. The preview still uses fixtures
until AC-121 publishes the database contract. Connect the boundary to the
confirmed RPCs and map only the fields reviewers need. The database must check
reviewer authorization on each operation and restrict private contact reads.
The browser authorization check is a UI guard.

Approval must grant publishing access and create the shared cap of three new
listings per week in the same backend transaction. Rejection must require a
reason on both sides. Once connected, reload queue and detail from Supabase
after a decision. Organizers, Listings and Audit Log stay in preview scope.
