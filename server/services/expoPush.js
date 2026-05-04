const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends a batch of Expo push messages. Chunks into groups of 100
 * per Expo's recommended batch size.
 * @param {Array<{to, title, body, data}>} messages
 */
async function sendPushBatch(messages) {
  if (messages.length === 0) return;

  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error('[expoPush] Expo API error:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[expoPush] fetch failed:', err);
    }
  }
}

/**
 * Sends a single Expo push notification.
 */
async function sendPush(token, title, body, data = {}) {
  return sendPushBatch([{ to: token, sound: 'default', title, body, data }]);
}

module.exports = { sendPush, sendPushBatch };
