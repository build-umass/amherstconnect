const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.resolve(
  __dirname,
  '..',
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json'
);

let db = null;
let auth = null;
let initializationError = null;

try {
  if (!fs.existsSync(serviceAccountPath)) {
    const error = new Error('Firebase service-account file was not found');
    error.code = 'FIREBASE_CREDENTIALS_MISSING';
    throw error;
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  db = admin.firestore();
  auth = admin.auth();
} catch (error) {
  initializationError = error;
  console.warn(
    '[firebase] Firebase Admin is unavailable; Firebase-backed routes will return 503.'
  );
}

function isFirebaseAvailable() {
  return db !== null && auth !== null;
}

module.exports = {
  admin,
  db,
  auth,
  initializationError,
  isFirebaseAvailable,
};
