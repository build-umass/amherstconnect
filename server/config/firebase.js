const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.resolve(
  __dirname,
  '..',
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json'
);

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
