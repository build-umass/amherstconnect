import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { authService, AuthServiceError } from '../../services/auth';
import { toAuthError } from '../../services/authService';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;
type Route = RouteProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AuthServiceError | null>(null);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await authService.signIn(email, password);
      // AuthContext receives SIGNED_IN and AppNavigator routes to onboarding
      // or the main app once the profile has loaded.
    } catch (e) {
      setError(toAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError(new AuthServiceError('invalid_email', 'Enter your email first, then tap "Forgot password?".'));
      return;
    }
    try {
      await authService.requestPasswordReset(email);
      // Same message whether or not an account exists for this email.
      Alert.alert('Check your email', 'If an account exists for this email, we sent a password reset link.');
    } catch (e) {
      setError(toAuthError(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome back</Text>

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
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        editable={!loading}
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity onPress={handleForgotPassword} disabled={loading}>
        <Text style={styles.forgot}>Forgot password?</Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error.message}</Text>
          {error.kind === 'email_not_confirmed' && (
            <TouchableOpacity onPress={() => navigation.navigate('ConfirmEmail', { email: email.trim().toLowerCase() })}>
              <Text style={styles.errorAction}>Resend confirmation email</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primary, (loading || !email || !password) && styles.primaryDisabled]}
        onPress={handleLogin}
        disabled={loading || !email || !password}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('RoleSelection')} style={styles.link} disabled={loading}>
        <Text style={styles.linkText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  forgot: { color: '#881c1c', textAlign: 'right', marginBottom: 16, fontSize: 14 },
  errorBox: { backgroundColor: '#fdf2f2', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#8a1f1f', fontSize: 14 },
  errorAction: { color: '#881c1c', fontSize: 14, fontWeight: '700', marginTop: 8 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
