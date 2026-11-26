# Organizer applications API (Task 1.1)

Applicant-side contract for the mobile app (Tasks 3.1 and 3.2) and the reviewer
portal (Task 5). Builds on the AC-101 schema in
`202611170001_organizer_permissions.sql`; this task's migration is
`202611220001_organizer_application_workflow.sql`.

All operations need a signed-in Supabase user. Signed-out calls fail with
`42501`.

## Read: `my_organizer_applications` (view)

The signed-in user's own applications, newest last by `created_at`. It never
includes another account's records, even for reviewers, and never includes
the private contact email or the reviewer's identity.

```ts
const { data, error } = await supabase
  .from('my_organizer_applications')
  .select('*')
  .order('created_at', { ascending: false });
```

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `organizer_name` | text | 1–200 characters |
| `organizer_kind` | text | See values below |
| `contact_name` | text | 1–120 characters |
| `contact_role` | text | 1–120 characters |
| `affiliation_url` | text | `https://` only |
| `amherst_street_address` | text or null | Optional, up to 300 characters |
| `about` | text | Plain text, 1–500 characters |
| `plans_events` | boolean | At least one of `plans_events` / `plans_deals` |
| `plans_deals` | boolean | |
| `estimated_posting_frequency` | text | See values below |
| `organizer_terms_accepted_at` | timestamptz | Set by the server |
| `status` | text | `pending`, `approved`, `rejected`, `withdrawn`, `revoked` |
| `approved_organizer_id` | uuid or null | Set on approval (Task 1.2) |
| `decided_at` | timestamptz or null | Set on approval or rejection |
| `rejection_reason` | text or null | Shown to the applicant when rejected |
| `created_at` | timestamptz | Original submission time. Never changes |
| `updated_at` | timestamptz | Last edit, withdrawal or decision |

The current application is the newest row. A user has at most one `pending`
row at a time.

### `organizer_kind` values

`individual`, `informal_group`, `local_business`, `student_organization`,
`nonprofit`, `umass_department`, `other`

### `estimated_posting_frequency` values (proposed)

`less_than_monthly`, `monthly`, `weekly`, `several_per_week`

This answers the "posting frequency input format" open decision. The list
lives in `organizer_posting_frequency_values()` so it can change in one place.

## Write operations (RPCs)

Each returns the updated application as one row in the `my_organizer_applications`
shape.

### `submit_organizer_application`

```ts
const { data, error } = await supabase.rpc('submit_organizer_application', {
  p_organizer_name: 'Pioneer Valley Book Club',
  p_organizer_kind: 'informal_group',
  p_contact_name: 'Alice Reader',
  p_contact_role: 'Organizer',
  p_affiliation_url: 'https://instagram.com/pvbookclub',
  p_amherst_street_address: null,           // optional; blank becomes null
  p_about: 'Monthly book discussions downtown.',
  p_plans_events: true,
  p_plans_deals: false,
  p_estimated_posting_frequency: 'monthly',
  p_accept_terms: true,
});
const application = data?.[0];
```

- The private contact email is copied from the signed-in account by the
  server. The app never sends it.
- The terms acceptance time is recorded by the server.
- Fails with `23505` if the user already has a pending application
  (`hint: pending_exists`) or an approved one (`hint: already_approved`).

### `update_organizer_application`

Edit and resubmit the caller's own pending application **in the same record**.
Same parameters as submit, plus `p_application_id` first. Terms must be
accepted again (`p_accept_terms: true`). `created_at` is kept.

- Someone else's or a missing application: `P0002` "Application not found."
- Not pending any more: `55000`, with the current status in `hint`.

### `withdraw_organizer_application`

```ts
await supabase.rpc('withdraw_organizer_application', { p_application_id: id });
```

Only the caller's own pending application. Same errors as update. A withdrawn
record stays as history, and the user can submit a new application afterwards.

## Errors

| `code` | Meaning | What the app shows |
|---|---|---|
| `22023` | A field is invalid | `message` next to the field named in `hint` |
| `23505` | Already pending or approved | `message` |
| `55000` | Application is no longer pending | `message`, then refresh the status |
| `P0002` | Not found (or not yours) | `message`, then refresh |
| `42501` | Not signed in, or not allowed | Sign-in prompt |

Validation `hint` values: `organizer_name`, `organizer_kind`, `contact_name`,
`contact_role`, `affiliation_url`, `amherst_street_address`, `about`, `plans`,
`estimated_posting_frequency`, `terms`.

## Mapping from the 3.1 fixture fields

| App field (`OrganizerApplicationDraft`) | RPC parameter |
|---|---|
| `organizationType` | `p_organizer_kind` (use the values above) |
| `organizationName` | `p_organizer_name` |
| `contactName` | `p_contact_name` |
| `contactRole` | `p_contact_role` |
| `affiliationUrl` | `p_affiliation_url` |
| `amherstAddress` | `p_amherst_street_address` |
| `about` | `p_about` |
| `postingPlans` | split into `p_plans_events`, `p_plans_deals` and `p_estimated_posting_frequency` |
| `termsAccepted` | `p_accept_terms` |
| `reviewerNote` | `rejection_reason` (revocation reason arrives with Task 1.3) |
| `submittedAt` | `created_at` |

## Security rules (enforced by the database)

- Applicants have no direct `INSERT`, `UPDATE` or `DELETE` on
  `organizer_applications`. They can only use the three operations above, which
  touch their own pending record.
- Reviewer fields (`status` decisions, `decided_by`, `decided_at`,
  `rejection_reason`, `approved_organizer_id`) are written only by the Task 1.2
  reviewer operations.
- Reviewers (`is_content_reviewer()`) can read every application from
  `organizer_applications`, and the private email through
  `reviewer_application_contact(id)`. They cannot edit an applicant's
  submission.
- Status changes, including withdrawal, are appended to `audit_log` by the
  AC-101 trigger.
- Tests: `supabase/tests/database/organizer_applications.test.sql`.
