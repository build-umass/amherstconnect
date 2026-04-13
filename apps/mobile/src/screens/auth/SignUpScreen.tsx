import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { signUpWithEmail, createUserDocument } from '../../services/auth';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { useAppleAuth } from '../../hooks/useAppleAuth';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { onboardingData, firebaseUser } = useAuth();
  const { promptGoogleSignIn, ready: googleReady } = useGoogleAuth();
  const { signInWithApple, isAvailable: appleAvailable } = useAppleAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignUp = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const cred = await signUpWithEmail(email, password);
      await createUserDocument(
        cred.user.uid,
        email,
        cred.user.displayName ?? email.split('@')[0],
        cred.user.photoURL,
        onboardingData?.role ?? 'student',
        [],
        'email',
      );
      navigation.navigate('InterestSelection');
    } catch (e: any) {
      Alert.alert('Sign Up Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await promptGoogleSignIn();
      // If new user, onAuthStateChanged fires but no doc yet — navigate to interests
      // The auth context + navigator will handle routing for returning users
      if (!firebaseUser) navigation.navigate('InterestSelection');
    } catch (e: any) {
      Alert.alert('Google Sign-In Failed', e.message);
    }
  };

  const handleApple = async () => {
    try {
      const result = await signInWithApple();
      if (result.isNewUser) navigation.navigate('InterestSelection');
    } catch (e: any) {
      Alert.alert('Apple Sign-In Failed', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Create your account</Text>

      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      <TouchableOpacity style={styles.primary} onPress={handleEmailSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign Up</Text>}
      </TouchableOpacity>

      {(googleReady || (Platform.OS === 'ios' && appleAvailable)) && (
        <>
          <Text style={styles.divider}>— or continue with —</Text>

          {googleReady && (
            <TouchableOpacity style={styles.oauth} onPress={handleGoogle}>
              <Text style={styles.oauthText}>Continue with Google</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'ios' && appleAvailable && (
            <TouchableOpacity style={[styles.oauth, { backgroundColor: '#000' }]} onPress={handleApple}>
              <Text style={[styles.oauthText, { color: '#fff' }]}>Continue with Apple</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
        <Text style={styles.linkText}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12 },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  divider: { textAlign: 'center', color: '#999', marginVertical: 20 },
  oauth: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  oauthText: { fontSize: 16, fontWeight: '500' },
  link: { alignItems: 'center', marginTop: 16 },
  linkText: { color: '#881c1c', fontSize: 15 },
});
