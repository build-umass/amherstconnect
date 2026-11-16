# BUILD reviewer portal

AC-132 adds the reviewer sign-in, queue, application details, and approve/reject
flow. Decisions affect fictional applications in memory and reset when the
page reloads or the reviewer signs out.

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
