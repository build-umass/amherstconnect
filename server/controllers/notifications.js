const { db } = require('../config/firebase');

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications, newest first.
 */
async function getNotifications(req, res) {
  try {
    const snap = await db
      .collection('notifications')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read. User must own the notification.
 */
async function markRead(req, res) {
  try {
    const ref = db.collection('notifications').doc(req.params.id);
    const snap = await ref.get();

    if (!snap.exists) return res.status(404).json({ error: 'Not found' });
    if (snap.data().userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ref.update({ read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * PATCH /api/notifications/read-all
 * Marks all of the authenticated user's unread notifications as read.
 */
async function markAllRead(req, res) {
  try {
    const snap = await db
      .collection('notifications')
      .where('userId', '==', req.user.uid)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();

    res.json({ updated: snap.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getNotifications, markRead, markAllRead };
