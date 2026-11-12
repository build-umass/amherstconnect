import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSavedEventReminders } from './reminders.mjs';

test('reminder worker uses canonical inbox IDs, finishes accepted claims, and leaves transient failures retryable', async () => {
  const calls = [];
  const result = await runSavedEventReminders({
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'enqueue_saved_event_reminders') return 2;
      if (name === 'claim_saved_event_deliveries') return ['accepted', 'invalid', 'retry'].map(kind => ({
        notification_id: kind, auth_session_id: 'session', attempt_token: kind + '-attempt',
        push_token: 'test-' + kind, event_title: 'Event title',
      }));
    },
    async deliver(message) {
      assert.equal(message.body, 'Event title');
      assert.equal(message.to, 'test-' + message.data.notificationId);
      if (message.data.notificationId === 'retry') throw new Error('test transient failure');
      return message.data.notificationId;
    },
  });
  assert.deepEqual(result, { created: 2, claimed: 3, accepted: 1, invalid: 1, retry: 1 });
  assert.deepEqual(calls.filter(([name]) => name === 'finish_saved_event_delivery').map(([, args]) => args.p_attempt_token),
    ['accepted-attempt', 'invalid-attempt']);
  assert.deepEqual(calls.find(([name]) => name === 'remove_unregistered_push_tokens')[1].p_expo_push_tokens, ['test-invalid']);
});
