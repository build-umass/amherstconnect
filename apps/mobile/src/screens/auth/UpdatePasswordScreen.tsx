import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { AuthServiceError, toAuthError } from '../../services/auth';

// Shown after a password-reset link signs the user in, before anything else.
// Saving the password continues into the app; logging out ends the recovery
// session instead.
export default function UpdatePasswordScreen() {
  const { user, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthServiceError | null>(null);

  const canSubmit = !!password && !!confirm && !busy;

  const handleSave = async () => {
    if (!canSubmit) return;
    if (password !== confirm) {
      setError(new AuthServiceError('invalid_input', 'The passwords do not match.'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      // AppNavigator now routes into the app and unmounts this screen.
      Alert.alert('Password updated', 'Use your new password the next time you log in.');
    } catch (e) {
      setError(toAuthError(e));
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Set a new password</Text>
      <Text style={styles.body}>
        Choose a new password{user?.email ? <> for <Text style={styles.email}>{user.email}</Text></> : null}.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
        onSubmitEditing={handleSave}
      />

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primary, !canSubmit && styles.primaryDisabled]}
        onPress={handleSave}
        disabled={!canSubmit}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save password</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSignOut} style={styles.link} disabled={busy}>
        <Text style={styles.linkText}>Cancel and log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#1a1a1a' },
  body: { fontSize: 15, color: '#555', marginBottom: 24, lineHeight: 21 },
  email: { fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  errorBox: { backgroundColor: '#fdf2f2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#8a1f1f', fontSize: 14 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
