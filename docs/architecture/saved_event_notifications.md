# Saved-event notifications

After the Q01 device migration, apply the saved-event notification migration.
The inbox is private to the recipient. Event and occurrence IDs are resolved
through the normal student read policies. A tap on an inbox item or notification
opens the canonical occurrence only after resolving the inbox item as the
current user.

The worker creates one reminder per account and bookmarked occurrence in the
next hour. It respects the saved-reminder preference. Push claims also verify
the current bookmark, occurrence status, session and device. A claim prevents
concurrent attempts for the same delivery. Transient failures can retry after
five minutes, up to three attempts, and no retries are claimed after the event
starts. If a push is accepted but its acknowledgement is lost, it can be
retried. Invalid device reports remove stale tokens through the Q01 RPC.

To exercise the worker on a local Supabase stack with a test bookmark and an
upcoming occurrence, run `node scripts/run-local-reminders.mjs --simulate`.
This updates the local inbox and delivery records and sends no push. Unit tests
inject a fake adapter and database tests verify the queue, access and claims.

Before enabling delivery, configure an Expo push adapter and receipt handling,
verify it on physical iOS and Android devices, and approve a worker schedule.
Matching notifications for newly published events require a confirmed mapping
between profile interests and event categories.

Before sending, the worker rechecks the claim, token, active session,
preferences, bookmark, and occurrence. A device detached or moved to another
account after claiming is skipped. Push payloads contain generic text and an
opaque inbox ID. Event details are fetched inside the app under account RLS,
so an already submitted push cannot reveal another account's event details.
