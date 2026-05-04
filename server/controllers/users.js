const { db } = require('../config/firebase');

async function getUser(req, res) {
  try {
    const doc = await db.collection('users').doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  if (req.user.uid !== req.params.uid) {
    return res.status(403).json({ error: 'Cannot update another user' });
  }
  try {
    await db.collection('users').doc(req.params.uid).update({
      ...req.body,
      updatedAt: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getUser, updateUser };
