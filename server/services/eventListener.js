const { db } = require('../config/firebase');
const { sendPushBatch } = require('./expoPush');

/**
 * Notifies all users whose interests overlap with the new event's category.
 * Writes a document to the `notifications` collection for each recipient,
 * then sends an Expo push to those with a stored token.
 */
// Maps Firestore event categories to the interest labels stored on user docs.
// User interests come from InterestSelectionScreen/EditInterestsScreen;
// event categories come from types/event.ts EventCategory.
const CATEGORY_TO_INTERESTS = {
  Dining:        ['Dining'],
  Sports:        ['Sports'],
  Nightlife:     ['Nightlife'],
  'Arts & Music': ['Arts', 'Music', 'Theater'],
  Campus:        ['Academic', 'RSO Events', 'RSO', 'Cultural'],
  All:           [], // 'All' is a UI filter only — no meaningful interest match
};

async function notifyMatchingUsers(eventId, event) {
  const category = event.category;
  if (!category) return;

  const interestLabels = CATEGORY_TO_INTERESTS[category] ?? [];
  if (interestLabels.length === 0) return;

  // Firestore `array-contains-any` matches users whose interests overlap
  // with any of the mapped labels (up to 30 values supported).
  const usersSnap = await db
    .collection('users')
    .where('interests', 'array-contains-any', interestLabels)
    .where('onboardingComplete', '==', true)
    .get();

  if (usersSnap.empty) return;

  const title = 'New event for you';
  const body = `${event.title} — ${event.date ?? ''} ${event.time ?? ''}`.trim();
  const now = new Date();

  const batch = db.batch();
  const pushMessages = [];

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();

    // Respect opt-out
    if (user.notificationPrefs?.newEvents === false) continue;

    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: user.uid,
      type: 'new_event_match',
      eventId,
      title,
      body,
      read: false,
      createdAt: now,
    });

    if (user.expoPushToken) {
      pushMessages.push({
        to: user.expoPushToken,
        sound: 'default',
        title,
        body,
        data: { type: 'new_event_match', eventId },
      });
    }
  }

  await batch.commit();
  await sendPushBatch(pushMessages);

  console.log(
    `[eventListener] Notified ${pushMessages.length} users about event "${event.title}"`,
  );
}

/**
 * Attaches a Firestore snapshot listener on the `events` collection.
 * Fires `notifyMatchingUsers` whenever a new document is added.
 * Returns the unsubscribe function.
 */
function startEventListener() {
  // Use a server-start timestamp so we only react to events created after boot,
  // not every existing document on the initial snapshot.
  const startedAt = new Date();

  const unsubscribe = db.collection('events').onSnapshot((snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;

      const data = change.doc.data();
      // createdAt may be a Firestore Timestamp or a JS Date
      const createdAt = data.createdAt?.toDate?.() ?? data.createdAt;
      if (createdAt && createdAt < startedAt) return; // skip pre-existing docs

      notifyMatchingUsers(change.doc.id, data).catch((err) =>
        console.error('[eventListener] notifyMatchingUsers failed:', err),
      );
    });
  });

  console.log('[eventListener] Listening for new events…');
  return unsubscribe;
}

module.exports = { startEventListener };
