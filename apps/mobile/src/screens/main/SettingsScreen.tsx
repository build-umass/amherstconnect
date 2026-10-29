import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getProfileRepository } from '../../services/profile';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { ProfileStackParamList } from '../../types/navigation';

const MAROON = '#881c1c';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile, setProfile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [notifyNewEvents, setNotifyNewEvents] = useState(
    profile?.notificationPrefs.newEvents ?? true,
  );
  const [notifySavedReminders, setNotifySavedReminders] = useState(
    profile?.notificationPrefs.savedReminders ?? true,
  );

  // Sync state if the profile changes after mount
  useEffect(() => {
    if (profile) {
      setNotifyNewEvents(profile.notificationPrefs.newEvents);
      setNotifySavedReminders(profile.notificationPrefs.savedReminders);
    }
  }, [profile]);

  const savePrefs = (newEvents: boolean, savedReminders: boolean) => {
    if (!profile) return;
    getProfileRepository()
      .updateNotificationPreferences({ newEvents, savedReminders })
      .then(setProfile)
      .catch((err) => {
        console.warn('[Settings] updateNotificationPreferences failed:', err);
        setNotifyNewEvents(profile.notificationPrefs.newEvents);
        setNotifySavedReminders(profile.notificationPrefs.savedReminders);
        Alert.alert('Error', 'Could not save notification settings.');
      });
  };

  const handleNewEventsToggle = (value: boolean) => {
    setNotifyNewEvents(value);
    savePrefs(value, notifySavedReminders);
  };

  const handleSavedRemindersToggle = (value: boolean) => {
    setNotifySavedReminders(value);
    savePrefs(notifyNewEvents, value);
  };

  const handleLogout = async () => {
    // Always succeeds locally; AppNavigator returns to the Welcome screen.
    await signOut();
  };

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: handleLogout },
    ]);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Account */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Name</Text>
          <Text style={styles.rowValue}>{profile?.displayName ?? '—'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
        </View>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('EditInterests')}
        >
          <Text style={styles.rowLabel}>Edit Interests</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications */}
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>New events for you</Text>
          <Switch
            value={notifyNewEvents}
            onValueChange={handleNewEventsToggle}
            trackColor={{ false: '#ddd', true: MAROON }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Saved event reminders</Text>
          <Switch
            value={notifySavedReminders}
            onValueChange={handleSavedRemindersToggle}
            trackColor={{ false: '#ddd', true: MAROON }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Log out */}
      <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Amherst Connect v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  rowValue: {
    fontSize: 15,
    color: '#888',
  },
  chevron: {
    fontSize: 22,
    color: '#ccc',
    fontWeight: '300',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 16,
  },
  logoutButton: {
    marginTop: 32,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#e53e3e',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 12,
    marginTop: 24,
  },
});
