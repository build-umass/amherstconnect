import React, { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList, MainTabParamList } from '../types/navigation';
import HomeScreen from '../screens/HomeScreen';
import EventDetailScreen from '../screens/main/EventDetailScreen';
import NotificationInboxScreen from '../screens/main/NotificationInboxScreen';
import { listNotices, markNoticeRead } from '../services/notificationInbox';
import { useAuth } from '../contexts/AuthContext';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const processing = new Set<string>();
    const open = async (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.content.data?.notificationId;
      if (typeof id !== 'string' || processing.has(id)) return;
      processing.add(id);
      try {
        // The payload cannot pick an event or bypass the inbox ownership policy.
        const [notice] = await listNotices(id);
        if (!active || !notice) return;
        navigation.navigate('Home', { screen: 'EventDetail', params: {
          eventId: notice.event_id, occurrenceId: notice.occurrence_id,
        } });
        Notifications.clearLastNotificationResponse();
        void markNoticeRead(id).catch(() => {});
      } catch {
        processing.delete(id);
      }
    };
    const listener = Notifications.addNotificationResponseReceivedListener(response => { void open(response); });
    void open(Notifications.getLastNotificationResponse());
    return () => { active = false; listener.remove(); };
  }, [navigation, user?.id]);

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Notifications" component={NotificationInboxScreen} />
    </Stack.Navigator>
  );
}
