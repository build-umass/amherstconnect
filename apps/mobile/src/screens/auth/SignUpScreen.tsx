import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { authService, AuthServiceError } from '../../services/auth';
import { toAuthError } from '../../services/authService';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { setOnboardingDisplayName } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthServiceError | null>(null);

  const canSubmit = !!name.trim() && !!email.trim() && !!password && !loading;

  const handleEmailSignUp = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      setOnboardingDisplayName(name.trim());
      const result = await authService.signUp(email, password, name);
      if (result.status === 'confirmation_required') {
        navigation.navigate('ConfirmEmail', { email: result.email });
      }
      // signed_in: AuthContext receives SIGNED_IN, finds no profile, and
      // AppNavigator remounts the stack at InterestSelection.
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Create your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        maxLength={100}
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (at least 6 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        onSubmitEditing={handleEmailSignUp}
      />

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primary, !canSubmit && styles.primaryDisabled]}
        onPress={handleEmailSignUp}
        disabled={!canSubmit}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign Up</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link} disabled={loading}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  errorBox: { backgroundColor: '#fdf2f2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#8a1f1f', fontSize: 14 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
