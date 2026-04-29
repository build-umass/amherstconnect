import { initializeApp } from 'firebase/app';
// @ts-ignore — getReactNativePersistence is missing from firebase v12 type defs
// but is available at runtime (see https://github.com/firebase/firebase-js-sdk/issues/8798)
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const app = initializeApp(firebaseConfig);

// Persist auth state across app restarts via AsyncStorage. Without this the
// Firebase JS SDK falls back to in-memory persistence in React Native and
// users get logged out on every cold start.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Auto-detect long-polling instead of forcing it — some networks reject the
// explicit force; auto-detect tries WebChannel first and falls back when
// needed. WebChannel streaming on RN is otherwise unreliable and surfaces
// as "WebChannelConnection RPC 'Listen' stream … transport errored".
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const storage = getStorage(app);
