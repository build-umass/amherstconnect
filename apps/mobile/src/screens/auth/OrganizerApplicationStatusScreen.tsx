import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { ORGANIZER_STATUS_FIXTURES, type OrganizerApplicationStatus } from '../../services/organizerApplications';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'OrganizerApplicationStatus'>;
type StatusRoute = RouteProp<AuthStackParamList, 'OrganizerApplicationStatus'>;
const STATUSES: OrganizerApplicationStatus[] = ['pending', 'approved', 'rejected', 'revoked'];

export default function OrganizerApplicationStatusScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<StatusRoute>();
  const status = route.params?.status ?? 'pending';
  const fixture = ORGANIZER_STATUS_FIXTURES[status];
  const rejected = status === 'rejected';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ORGANIZER APPLICATION</Text>
        <Text style={styles.heading}>{fixture.label}</Text>
        <Text style={styles.body}>{status === 'pending'
          ? 'Your application is in the review queue. You can check back here for an update.'
          : status === 'approved'
            ? 'Your organizer application has been approved. Organizer publishing will be available when the listing route is connected.'
            : status === 'rejected'
              ? 'Your application needs an update before it can be approved.'
              : 'Organizer access for this account is no longer active.'}</Text>
        {!!fixture.reason && <View style={styles.reasonBox}><Text style={styles.reasonTitle}>Reviewer note</Text><Text style={styles.reason}>{fixture.reason}</Text></View>}
        {rejected && (
          <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('OrganizerApplication')}>
            <Text style={styles.primaryText}>Start a new application</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.preview}>
        <Text style={styles.previewTitle}>Preview application states</Text>
        <Text style={styles.previewIntro}>Sample states let you review the status screens while the review service is being connected.</Text>
        <View style={styles.statuses}>
          {STATUSES.map(value => {
            const selected = value === status;
            return (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => navigation.setParams({ status: value })}
                style={[styles.statusButton, selected && styles.statusButtonSelected]}
              >
                <Text style={[styles.statusText, selected && styles.statusTextSelected]}>{ORGANIZER_STATUS_FIXTURES[value].label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', flexGrow: 1, padding: 24 },
  card: { backgroundColor: '#fff', borderColor: '#e5e5e5', borderRadius: 16, borderWidth: 1, padding: 20 },
  eyebrow: { color: '#881c1c', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  heading: { color: '#1a1a1a', fontSize: 25, fontWeight: '700', marginBottom: 10 },
  body: { color: '#555', fontSize: 15, lineHeight: 23 },
  reasonBox: { backgroundColor: '#f7f7f7', borderRadius: 10, marginTop: 18, padding: 14 },
  reasonTitle: { color: '#333', fontSize: 14, fontWeight: '700', marginBottom: 5 },
  reason: { color: '#555', fontSize: 14, lineHeight: 21 },
  primary: { alignItems: 'center', backgroundColor: '#881c1c', borderRadius: 10, marginTop: 22, paddingVertical: 15 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  preview: { marginTop: 28 },
  previewTitle: { color: '#252525', fontSize: 17, fontWeight: '700' },
  previewIntro: { color: '#777', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  statuses: { gap: 9 },
  statusButton: { borderColor: '#ddd', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  statusButtonSelected: { backgroundColor: '#fdf2f2', borderColor: '#881c1c' },
  statusText: { color: '#444', fontSize: 14 },
  statusTextSelected: { color: '#881c1c', fontWeight: '600' },
});
