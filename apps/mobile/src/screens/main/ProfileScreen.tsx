import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { logout } from '../../services/auth';

export default function ProfileScreen() {
  const { appUser } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const roleLabels: Record<string, string> = {
    student: 'Student',
    faculty_staff: 'Faculty / Staff',
    alumni: 'Alumni',
    local_resident: 'Local Resident',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{appUser?.displayName ?? 'User'}</Text>
      <Text style={styles.email}>{appUser?.email}</Text>
      <View style={styles.badges}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{roleLabels[appUser?.role ?? ''] ?? appUser?.role}</Text>
        </View>
        {appUser?.eduVerified && (
          <View style={[styles.badge, styles.eduBadge]}>
            <Text style={[styles.badgeText, { color: '#fff' }]}>UMass Verified</Text>
          </View>
        )}
      </View>

      {appUser?.role === 'student' && !appUser.eduVerified && (
        <TouchableOpacity style={styles.verifyButton} onPress={() => Alert.alert('Coming soon', '.edu verification will be available soon.')}>
          <Text style={styles.verifyText}>Verify .edu email</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  name: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 15, color: '#666', marginBottom: 16 },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  badge: { backgroundColor: '#f0f0f0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  eduBadge: { backgroundColor: '#881c1c' },
  badgeText: { fontSize: 13, fontWeight: '500' },
  verifyButton: { borderWidth: 1, borderColor: '#881c1c', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  verifyText: { color: '#881c1c', fontSize: 15, fontWeight: '500' },
  logoutButton: { marginTop: 'auto', marginBottom: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: '#e53e3e', fontSize: 16, fontWeight: '500' },
});
