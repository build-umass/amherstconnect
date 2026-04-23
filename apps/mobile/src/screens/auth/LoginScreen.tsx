import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { loginWithEmail, resetPassword } from '../../services/auth';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { promptGoogleSignIn, signingIn: googleSigningIn, ready: googleReady } = useGoogleAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      // onAuthStateChanged in AuthContext handles navigation
    } catch (e: any) {
      Alert.alert('Login Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) { Alert.alert('Enter your email first'); return; }
    try {
      await resetPassword(email);
      Alert.alert('Check your email', 'Password reset link sent.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome back</Text>

      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      <TouchableOpacity onPress={handleForgotPassword}>
        <Text style={styles.forgot}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primary} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Log In</Text>}
      </TouchableOpacity>

      {googleReady && (
        <>
          <Text style={styles.divider}>— or continue with —</Text>
          <TouchableOpacity style={styles.oauth} onPress={() => promptGoogleSignIn()}>
            <Text style={styles.oauthText}>Continue with Google</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('RoleSelection')} style={styles.link}>
        <Text style={styles.linkText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>

      {googleSigningIn && (
        <View style={styles.overlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#881c1c" />
          <Text style={styles.overlayText}>Signing in…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  forgot: { color: '#881c1c', textAlign: 'right', marginBottom: 16, fontSize: 14 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  divider: { textAlign: 'center', color: '#999', marginVertical: 20 },
  oauth: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  oauthText: { fontSize: 16, fontWeight: '500' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { marginTop: 12, color: '#881c1c', fontSize: 15, fontWeight: '500' },
});
