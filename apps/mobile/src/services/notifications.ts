import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { PermissionStatus } from 'expo';
import { Platform } from 'react-native';
import { getSupabase } from './supabase';
import {
  createPushDevices,
  PushDeviceError,
  type PushPermission,
} from './pushDevices';
import { createPushInstallation } from './pushInstallation';

// Show notifications that arrive while the app is open, like in the background.
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function toPushPermission(settings: ExpoNotifications.NotificationPermissionsStatus): PushPermission {
  // iOS provisional authorization delivers quietly to Notification Center.
  if (settings.granted || settings.ios?.status === ExpoNotifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return settings.status === PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied';
}

let pushDevices: ReturnType<typeof createPushDevices> | null = null;

/** Q01 device registration bound to expo-notifications and the app's Supabase client. */
export function getPushDevices() {
  pushDevices ??= createPushDevices({
    updateInstallation: createPushInstallation({
      storage: AsyncStorage,
      newProof: () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
        value => value.toString(16).padStart(2, '0')).join(''),
      async write(update, accessToken, signal) {
        const request = getSupabase().rpc('sync_push_installation', update);
        if (accessToken) request.setHeader('Authorization', `Bearer ${accessToken}`);
        // A hung connection must not hold up a newer session's cleanup.
        const controller = new AbortController();
        const abort = () => controller.abort();
        const timer = setTimeout(abort, 8_000);
        signal?.addEventListener('abort', abort);
        if (signal?.aborted) abort();
        try {
          const { error } = await request.abortSignal(controller.signal);
          if (error) throw new PushDeviceError('Could not sync push registration.', error.code);
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        }
      },
    }),
    platform: {
      // Simulators and emulators cannot receive push notifications.
      os: Device.isDevice && (Platform.OS === 'ios' || Platform.OS === 'android') ? Platform.OS : null,
      async prepare() {
        if (Platform.OS === 'android') {
          await ExpoNotifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: ExpoNotifications.AndroidImportance.MAX,
          });
        }
      },
      getPermission: async () => toPushPermission(await ExpoNotifications.getPermissionsAsync()),
      requestPermission: async () => toPushPermission(await ExpoNotifications.requestPermissionsAsync()),
      async getExpoPushToken() {
        const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
        const { data } = await ExpoNotifications.getExpoPushTokenAsync({ projectId });
        return data;
      },
    },
  });
  return pushDevices;
}
