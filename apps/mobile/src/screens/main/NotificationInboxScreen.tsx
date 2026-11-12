import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../types/navigation';
import { listNotices, markNoticeRead, type SavedEventNotice } from '../../services/notificationInbox';

export default function NotificationInboxScreen({ navigation }: NativeStackScreenProps<HomeStackParamList, 'Notifications'>) {
  const [notices, setNotices] = useState<SavedEventNotice[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setStatus('loading');
    void listNotices().then(rows => {
      if (!active) return;
      setNotices(rows);
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [attempt]));

  if (status !== 'ready') return <View style={styles.message}>
    <Text>{status === 'loading' ? 'Loading notifications…' : 'Could not load notifications.'}</Text>
    {status === 'error' && <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}>
      <Text style={styles.unread}>Try again</Text>
    </Pressable>}
  </View>;

  return <FlatList
    data={notices}
    keyExtractor={item => item.id}
    ListEmptyComponent={<Text style={styles.message}>No notifications yet.</Text>}
    renderItem={({ item }) => (
      <Pressable accessibilityRole="button" style={styles.message} onPress={() => {
        void markNoticeRead(item.id).catch(() => {});
        navigation.navigate('EventDetail', { eventId: item.event_id, occurrenceId: item.occurrence_id });
      }}>
        <Text style={!item.read_at && styles.unread}>{item.event_title}</Text>
        <Text>Saved event reminder</Text>
      </Pressable>
    )}
  />;
}

const styles = StyleSheet.create({
  message: { padding: 16 },
  unread: { fontWeight: 'bold' },
});
