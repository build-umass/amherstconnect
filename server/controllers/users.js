const firebase = require('../config/firebase');

const ALLOWED_UPDATE_FIELDS = new Set([
  'displayName',
  'photoURL',
  'interests',
  'onboardingComplete',
  'expoPushToken',
  'notificationPrefs',
]);

function ensureOwnUser(req, res) {
  if (req.user.uid !== req.params.uid) {
    res.status(403).json({ error: 'Cannot access another user' });
    return false;
  }

  return true;
}

async function getUser(req, res) {
  if (!ensureOwnUser(req, res)) return;

  try {
    const doc = await firebase.db.collection('users').doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  if (!ensureOwnUser(req, res)) return;

  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const requestedFields = Object.keys(req.body);
  const forbiddenFields = requestedFields.filter(
    (field) => !ALLOWED_UPDATE_FIELDS.has(field)
  );

  if (forbiddenFields.length > 0) {
    return res.status(400).json({
      error: 'Unsupported user update fields',
      fields: forbiddenFields.sort(),
    });
  }

  if (requestedFields.length === 0) {
    return res.status(400).json({ error: 'No supported user fields provided' });
  }

  const updates = Object.fromEntries(
    requestedFields.map((field) => [field, req.body[field]])
  );

  try {
    await firebase.db.collection('users').doc(req.params.uid).update({
      ...updates,
      updatedAt: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getUser, updateUser };
