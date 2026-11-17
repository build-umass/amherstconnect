import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

// Last onboarding step while interest selection is hidden (constants/features).
// Saves the profile with no interests; AppNavigator then switches to MainTabs.
export default function FinishOnboardingScreen() {
  const { completeOnboarding, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const finish = useCallback(async () => {
    setError(null);
    try {
      await completeOnboarding([]);
    } catch (e: any) {
      setError(e?.message ?? 'Please try again.');
    }
  }, [completeOnboarding]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finish();
  }, [finish]);

  if (!error) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#881c1c" />
        <TouchableOpacity style={styles.link} onPress={() => void signOut()}>
          <Text style={styles.linkText}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Could not save your profile</Text>
      <Text style={styles.body}>{error}</Text>
      <TouchableOpacity style={styles.primary} onPress={() => void finish()}>
        <Text style={styles.primaryText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={() => void signOut()}>
        <Text style={styles.linkText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#1a1a1a' },
  body: { fontSize: 15, color: '#555', marginBottom: 32, lineHeight: 21 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: 20, minHeight: 24 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
