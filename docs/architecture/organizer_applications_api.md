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

---

# Reviewer decisions and posting access (Task 1.2)

Migration: `202611220002_organizer_application_decisions.sql`. Tests:
`supabase/tests/database/organizer_decisions.test.sql`.

Every operation below checks `is_content_reviewer()` in the database and fails
with `42501` for anyone else. The portal's own role check is only a UI guard.

## Queue and detail (portal, Task 5.2)

```js
// Queue. p_status: 'pending' (default), 'approved', 'rejected', 'withdrawn',
// 'revoked', or null for all. Pending is oldest first; decided is newest first.
const { data } = await supabase.rpc('reviewer_list_organizer_applications', {
  p_status: 'pending',
  p_limit: 100,
});

// Detail
const { data } = await supabase.rpc('reviewer_get_organizer_application', {
  p_application_id: id,
});
```

Both return every application field, including `applicant_profile_id`,
`contact_email` (private) and `decided_by`. An unknown ID gives `P0002`.

## Approve

```js
const { data } = await supabase.rpc('approve_organizer_application', {
  p_application_id: id,
  p_weekly_cap: 3, // optional, 0–50. 0 approves with posting paused
});
// data[0] = { application_id, organizer_id, status: 'approved', weekly_cap, decided_at }
```

In one transaction, approval:

1. creates the organizer (`organizers`, `approved_at` set);
2. gives the applicant a current `manager` membership (`organizer_memberships`,
   `granted_by` = reviewer);
3. copies the private email into `organization_contacts`;
4. creates `organizer_publishing_settings` with the weekly cap;
5. marks the application `approved` with `approved_organizer_id`,
   `decided_by` and `decided_at`.

If any step fails, nothing is saved.

## Reject

```js
await supabase.rpc('reject_organizer_application', {
  p_application_id: id,
  p_reason: 'Add a link to your business page.', // required, 1–1,000 characters
});
// data[0] = { application_id, status: 'rejected', rejection_reason, decided_at }
```

The applicant sees `rejection_reason` in `my_organizer_applications`. To
reapply, they submit a new application; the rejected one stays as history.

## Decision errors

| `code` | Meaning |
|---|---|
| `42501` | Not a reviewer, or a reviewer deciding their own application (`hint: self_review`) |
| `22023` | Missing rejection reason (`hint: reason`) or cap outside 0–50 (`hint: weekly_cap`) |
| `55000` | Already decided or withdrawn. The current status is in `hint`. Reload the queue |
| `P0002` | Application not found |

Two reviewers can't decide the same application twice. The decision locks the
application row, so the second reviewer waits and then gets `55000`.

## Posting access for the app (Tasks 2.2, 3.2, 4.x)

```ts
const { data } = await supabase.rpc('my_organizer_access');
// [{ organizer_id, organizer_name, can_post, weekly_cap,
//    posting_revoked_at, posting_revocation_reason }]
```

Empty means the user isn't an approved organizer. `can_post` uses the same
rule as `can_manage_organizer(organizer_id)`: a current membership, and an
organizer that is active, approved and not revoked. Task 2.2 should use
`can_manage_organizer` for its write checks and read `weekly_cap` from
`organizer_publishing_settings`.

## `organizer_publishing_settings`

| Column | Notes |
|---|---|
| `organizer_id` | PK, one row per approved organizer |
| `weekly_cap` | Default 3, 0–50. 0 pauses new posts |
| `updated_by` | Reviewer who set it |
| `updated_at` | Server time |

Created on approval. Members can read their own row and reviewers can read all.
Nobody can change it from the app yet. The reviewer cap-change operation comes
with Task 2.3/5.3.

Every decision is appended to `audit_log` (`application_approved`,
`application_rejected`) with the reviewer as actor.
