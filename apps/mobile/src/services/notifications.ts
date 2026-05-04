import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { NotificationPrefs } from '../types/auth';

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests push notification permissions, obtains the Expo push token,
 * and persists it to the user's Firestore doc. Call on sign-in.
 */
export async function registerPushToken(uid: string): Promise<void> {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await ExpoNotifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await ExpoNotifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: ExpoNotifications.AndroidImportance.MAX,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await ExpoNotifications.getExpoPushTokenAsync({ projectId });

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { expoPushToken: token, updatedAt: serverTimestamp() });
}

/**
 * Writes the user's notification preference toggles to Firestore.
 */
export async function saveNotificationPrefs(
  uid: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { notificationPrefs: prefs, updatedAt: serverTimestamp() });
}
