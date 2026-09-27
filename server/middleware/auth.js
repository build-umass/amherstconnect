const { auth, isFirebaseAvailable } = require('../config/firebase');

async function requireAuth(req, res, next) {
  if (!isFirebaseAvailable()) {
    return res.status(503).json({
      error: 'Firebase Admin is unavailable',
      code: 'FIREBASE_UNAVAILABLE',
    });
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const token = header.split('Bearer ')[1];
    req.user = await auth.verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
