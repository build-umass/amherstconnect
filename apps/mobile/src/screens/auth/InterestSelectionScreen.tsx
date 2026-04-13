import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { createUserDocument, checkUserExists } from '../../services/auth';

const INTERESTS = [
  'Dining', 'Music', 'Sports', 'Cultural', 'RSO',
  'Nightlife', 'Outdoors', 'Arts', 'Study Spots',
  'Shopping', 'Community', 'Fitness', 'Tech',
];

export default function InterestSelectionScreen() {
  const { firebaseUser, onboardingData, refreshUser } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = (tag: string) => {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const finish = async (interests: string[]) => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const exists = await checkUserExists(firebaseUser.uid);
      if (!exists) {
        await createUserDocument(
          firebaseUser.uid,
          firebaseUser.email ?? '',
          firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User',
          firebaseUser.photoURL,
          onboardingData?.role ?? 'student',
          interests,
          firebaseUser.providerData[0]?.providerId === 'google.com' ? 'google' :
          firebaseUser.providerData[0]?.providerId === 'apple.com' ? 'apple' : 'email',
        );
      }
      await refreshUser();
      // AuthContext + AppNavigator will auto-navigate to MainTabs
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>What are you interested in?</Text>
      <Text style={styles.sub}>Pick a few to personalize your feed</Text>

      <View style={styles.tags}>
        {INTERESTS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[styles.tag, selected.includes(tag) && styles.tagSelected]}
            onPress={() => toggle(tag)}
          >
            <Text style={[styles.tagText, selected.includes(tag) && styles.tagTextSelected]}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={() => finish(selected)} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => finish([])} disabled={loading}>
          <Text style={styles.skip}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 15, color: '#666', marginBottom: 24 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: { borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  tagSelected: { backgroundColor: '#881c1c', borderColor: '#881c1c' },
  tagText: { fontSize: 14, color: '#333' },
  tagTextSelected: { color: '#fff' },
  actions: { marginTop: 'auto', paddingBottom: 40, gap: 16 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  skip: { textAlign: 'center', color: '#999', fontSize: 15 },
});
