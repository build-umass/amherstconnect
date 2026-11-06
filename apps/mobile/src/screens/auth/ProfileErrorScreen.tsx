import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

// Shown when a signed-in user's profile cannot be read (offline, server error).
// The session is kept so a retry can succeed without logging in again.
export default function ProfileErrorScreen() {
  const { profileError, retryProfile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Couldn't load your profile</Text>
      <Text style={styles.body}>{profileError ?? 'Something went wrong. Please try again.'}</Text>

      <TouchableOpacity style={styles.primary} onPress={() => void retryProfile()}>
        <Text style={styles.primaryText}>Try again</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={handleSignOut} disabled={signingOut}>
        {signingOut ? <ActivityIndicator color="#881c1c" /> : <Text style={styles.linkText}>Log out</Text>}
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
