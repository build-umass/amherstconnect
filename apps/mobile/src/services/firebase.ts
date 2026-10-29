import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey:            Constants.expoConfig?.extra?.firebaseApiKey,
  authDomain:        Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId:         Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket:     Constants.expoConfig?.extra?.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId:             Constants.expoConfig?.extra?.firebaseAppId,
};

const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingFirebaseConfig.length > 0) {
  throw new Error(
    `Missing Firebase config: ${missingFirebaseConfig.join(', ')}. ` +
    'Create apps/mobile/.env with FIREBASE_* values and restart Expo.'
  );
}

// Auth is handled by Supabase (services/auth.ts); Firebase remains only for
// the Firestore data that has not moved yet.
const app = initializeApp(firebaseConfig);

// Auto-detect long-polling instead of forcing it — some networks reject the
// explicit force; auto-detect tries WebChannel first and falls back when
// needed. WebChannel streaming on RN is otherwise unreliable and surfaces
// as "WebChannelConnection RPC 'Listen' stream … transport errored".
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const storage = getStorage(app);
