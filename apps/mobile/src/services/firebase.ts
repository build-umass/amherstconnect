import { initializeApp } from 'firebase/app';
import { getAuth }        from 'firebase/auth';
import { getFirestore }   from 'firebase/firestore';
import { getStorage }     from 'firebase/storage';
import Constants          from 'expo-constants';

const firebaseConfig = {
  apiKey:            Constants.expoConfig?.extra?.firebaseApiKey,
  authDomain:        Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId:         Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket:     Constants.expoConfig?.extra?.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId:             Constants.expoConfig?.extra?.firebaseAppId,
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
