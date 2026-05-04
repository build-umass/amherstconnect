const { db } = require('../config/firebase');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEduCode(req, res) {
  const { eduEmail } = req.body;
  const uid = req.user.uid;

  if (!eduEmail?.endsWith('.edu')) {
    return res.status(400).json({ error: 'Must be a .edu email address' });
  }

  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.collection('edu_verifications').add({
      uid,
      eduEmail,
      code,
      verified: false,
      createdAt: new Date(),
      expiresAt,
    });

    // TODO: Send email via nodemailer. For now, log the code in dev.
    console.log(`[DEV] .edu verification code for ${eduEmail}: ${code}`);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function confirmEduCode(req, res) {
  const { code } = req.body;
  const uid = req.user.uid;

  try {
    const snapshot = await db.collection('edu_verifications')
      .where('uid', '==', uid)
      .where('code', '==', code)
      .where('verified', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    if (new Date() > data.expiresAt.toDate()) {
      return res.status(400).json({ error: 'Code has expired' });
    }

    // Mark verification as used
    await doc.ref.update({ verified: true });

    // Update user and student profile
    await db.collection('users').doc(uid).update({ eduVerified: true, updatedAt: new Date() });
    await db.collection('student_profiles').doc(uid).update({ eduVerified: true, eduEmail: data.eduEmail });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { sendEduCode, confirmEduCode };
