const { db } = require('../config/firebase');
const { sendPushBatch } = require('./expoPush');

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
// Window: events starting between now and now + 1 hour
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Finds bookmarked events starting within the next hour and sends
 * a reminder push to each user who has not already been reminded.
 */
async function sendSavedEventReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);

  try {
    // Get events starting in the next hour
    const eventsSnap = await db
      .collection('events')
      .where('start_time', '>=', now)
      .where('start_time', '<=', windowEnd)
      .get();

    if (eventsSnap.empty) return;

    const eventIds = eventsSnap.docs.map((d) => d.id);
    const eventsById = Object.fromEntries(
      eventsSnap.docs.map((d) => [d.id, d.data()]),
    );

    // Find all bookmarks for these events (Firestore `in` supports up to 30 values)
    const idChunks = [];
    for (let i = 0; i < eventIds.length; i += 30) {
      idChunks.push(eventIds.slice(i, i + 30));
    }

    const bookmarkDocs = [];
    for (const chunk of idChunks) {
      const snap = await db
        .collection('bookmarks')
        .where('eventId', 'in', chunk)
        .get();
      bookmarkDocs.push(...snap.docs);
    }

    if (bookmarkDocs.length === 0) return;

    // Deduplicate and filter out bookmarks already reminded for this event.
    // `remindedAt` is stamped on the bookmark doc when we send a reminder,
    // so we won't double-fire even if the same event stays in the window
    // across multiple 15-minute polls.
    const seen = new Set();
    const toNotify = bookmarkDocs.filter((d) => {
      const { userId, eventId, remindedAt } = d.data();
      const key = `${userId}:${eventId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (remindedAt) return false; // already reminded for this event
      return true;
    });

    // Collect unique user IDs and fetch their docs in parallel
    const userIds = [...new Set(toNotify.map((d) => d.data().userId))];
    const userDocs = await Promise.all(
      userIds.map((uid) => db.collection('users').doc(uid).get()),
    );
    const usersById = Object.fromEntries(
      userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]),
    );

    const firestoreBatch = db.batch();
    const pushMessages = [];
    const now2 = new Date();

    for (const bookmarkDoc of toNotify) {
      const { userId, eventId } = bookmarkDoc.data();
      const user = usersById[userId];
      const event = eventsById[eventId];
      if (!user || !event) continue;

      // Respect opt-out
      if (user.notificationPrefs?.savedReminders === false) continue;

      const title = 'Event starting soon';
      const body = `${event.title} starts in less than an hour`;

      // Stamp remindedAt so this bookmark is skipped on the next poll
      firestoreBatch.update(bookmarkDoc.ref, { remindedAt: now2 });

      const notifRef = db.collection('notifications').doc();
      firestoreBatch.set(notifRef, {
        userId,
        type: 'saved_event_reminder',
        eventId,
        title,
        body,
        read: false,
        createdAt: now2,
      });

      if (user.expoPushToken) {
        pushMessages.push({
          to: user.expoPushToken,
          sound: 'default',
          title,
          body,
          data: { type: 'saved_event_reminder', eventId },
        });
      }
    }

    await firestoreBatch.commit();
    await sendPushBatch(pushMessages);

    if (pushMessages.length > 0) {
      console.log(`[reminderJob] Sent ${pushMessages.length} saved-event reminders`);
    }
  } catch (err) {
    console.error('[reminderJob] Failed:', err);
  }
}

/**
 * Starts the recurring reminder poll. Returns a cleanup function
 * that clears the interval.
 */
function startReminderJob() {
  // Run once immediately on startup, then on the interval
  sendSavedEventReminders();
  const id = setInterval(sendSavedEventReminders, POLL_INTERVAL_MS);
  console.log('[reminderJob] Reminder job started — polling every 15 minutes');
  return () => clearInterval(id);
}

module.exports = { startReminderJob };
