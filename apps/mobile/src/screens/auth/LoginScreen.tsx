import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { loginWithEmail, resetPassword } from '../../services/auth';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { useAppleAuth } from '../../hooks/useAppleAuth';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { promptGoogleSignIn, ready: googleReady } = useGoogleAuth();
  const { signInWithApple, isAvailable: appleAvailable } = useAppleAuth();

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

      {(googleReady || (Platform.OS === 'ios' && appleAvailable)) && (
        <>
          <Text style={styles.divider}>— or continue with —</Text>

          {googleReady && (
            <TouchableOpacity style={styles.oauth} onPress={() => promptGoogleSignIn()}>
              <Text style={styles.oauthText}>Continue with Google</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'ios' && appleAvailable && (
            <TouchableOpacity style={[styles.oauth, { backgroundColor: '#000' }]} onPress={() => signInWithApple()}>
              <Text style={[styles.oauthText, { color: '#fff' }]}>Continue with Apple</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('RoleSelection')} style={styles.link}>
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
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  divider: { textAlign: 'center', color: '#999', marginVertical: 20 },
  oauth: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  oauthText: { fontSize: 16, fontWeight: '500' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
