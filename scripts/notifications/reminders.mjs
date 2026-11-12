/** Runs one bounded batch. Inject the database RPC and a push adapter.
 * The adapter must report acceptance, a permanently invalid token, or retry.
 * A transport interruption leaves the claim to expire before retry.
 */
export async function runSavedEventReminders({ rpc, deliver }) {
  const created = await rpc('enqueue_saved_event_reminders', {});
  const batch = await rpc('claim_saved_event_deliveries', {});
  const counts = { created, claimed: batch.length, accepted: 0, invalid: 0, retry: 0 };
  for (const row of batch) {
    const sentAt = new Date().toISOString();
    let outcome;
    try {
      outcome = await deliver({
        to: row.push_token,
        title: 'Saved event starting soon',
        body: row.event_title,
        data: { notificationId: row.notification_id },
      });
    } catch {
      outcome = 'retry';
    }
    if (outcome !== 'accepted' && outcome !== 'invalid') {
      counts.retry++;
      continue;
    }
    if (outcome === 'invalid') {
      await rpc('remove_unregistered_push_tokens', { p_expo_push_tokens: [row.push_token], p_sent_at: sentAt });
    }
    await rpc('finish_saved_event_delivery', {
      p_notification_id: row.notification_id, p_session_id: row.auth_session_id, p_attempt_token: row.attempt_token,
    });
    counts[outcome]++;
  }
  return counts;
}
