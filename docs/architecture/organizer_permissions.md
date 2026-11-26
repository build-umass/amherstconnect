# Organizer schema and permissions (AC-101)

The Supabase migration history for hosted development includes the original event
foundation and A09 lifecycle migration. It does not yet include R04
`202611070001`. Apply only reviewed migrations in version order during a
separately authorized rollout. AC-101 is additive to that history.

## Interfaces for Tasks 1.1 and 1.2

- `organizer_applications` stores the applicant profile, organizer identity,
  contact name and role, affiliation URL, optional street address, description,
  posting plans and estimate, acceptance timestamp, status and decision metadata.
  Authenticated users can insert a pending application for themselves. The
  database snapshots the account email and terms timestamp. Applicants read their
  own application by selecting the granted columns explicitly. Reviewers can
  read the queue and fetch private email through
  `reviewer_application_contact(p_application_id)`.
- Decision states are `pending`, `approved`, `rejected`, `revoked`, and
  `withdrawn`. Rejection requires a reason and approvals require an organizer
  reference. AC-121 owns reviewer-only decision RPCs, guarded transitions and
  atomic writes for organizer approval, membership, contact and default shared
  cap. Applicants have no direct decision write. Pending-edit and withdrawal
  operations belong to the application workflow.
- `organizers` and `organizer_memberships` retain existing R04 IDs. A membership
  is current when `revoked_at is null`. Posting also requires an active organizer
  with `approved_at` set and no `posting_revoked_at`. Approved organizer
  contacts are in `organization_contacts`, readable only by reviewers and the
  trusted backend.
- `public.organizers` is the renamed existing source catalog. Its IDs and source
  identities are preserved. Legacy R04 business rows join this catalog with their
  own IDs, without inferring aliases. `events.organizer_id` is the renamed
  `organization_id`; it is the only event organizer foreign key. Localist events
  remain read-only to organizer members, even if a membership is mistakenly
  associated with an imported catalog row.
- `public.organizations` is a compatibility view over the same catalog for existing
  importer/seed transport. It contains only the old public catalog columns and
  honors underlying RLS. Existing feed RPC filter/output names stay compatible.
- Members can create drafts and edit allowed fields on their own drafts or
  published events. Direct writes cannot change event status or ownership.
  The publishing task must publish events and create occurrences through the
  shared-cap transaction. Reviewers can archive a published organizer event
  with `remove_organizer_event(p_event_id)`. Students cannot read events
  belonging to revoked organizers. Localist imports retain their existing paths.
- Database triggers append to `audit_log` for application status changes,
  organizer revocation and managed event changes. Reviewers can read it.
  Application roles cannot write, edit or delete entries. Historical identifiers
  are retained in the audit even if the subject is later removed.

The old listing-submission RPCs are removed. The old queue is removed from the
public API and retained in an inaccessible archive schema so the migration can
preserve records without continuing per-listing approval. Historical migration
files remain unchanged for replay. Deals, cap enforcement and portal changes are
outside AC-101.
