import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { PermissionStatus } from 'expo';
import { Platform } from 'react-native';
import { getSupabase } from './supabase';
import {
  createPushDevices,
  type PushDeviceClient,
  type PushPermission,
} from './pushDevices';

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
    client: getSupabase() as unknown as PushDeviceClient,
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
