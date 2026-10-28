import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import { authService, AuthServiceError } from '../../services/auth';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ConfirmEmail'>;
type Route = RouteProp<AuthStackParamList, 'ConfirmEmail'>;

// Shown after signup when the project requires email confirmation (no session
// yet) and when login is refused for an unconfirmed email. Opening the link on
// this device signs the user in via the auth callback deep link.
export default function ConfirmEmailScreen() {
  const navigation = useNavigation<Nav>();
  const { email } = useRoute<Route>().params;
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendConfirmation(email);
      Alert.alert('Email sent', `We sent another confirmation link to ${email}.`);
    } catch (e) {
      Alert.alert('Could not resend', e instanceof AuthServiceError ? e.message : 'Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Check your email</Text>
      <Text style={styles.body}>
        We sent a confirmation link to <Text style={styles.email}>{email}</Text>. Open it on this
        device to finish creating your account.
      </Text>
      <Text style={styles.hint}>Didn't get it? Check your spam folder or send it again.</Text>

      <TouchableOpacity style={styles.secondary} onPress={handleResend} disabled={resending}>
        {resending ? <ActivityIndicator color="#881c1c" /> : <Text style={styles.secondaryText}>Resend email</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('Login', { email })}>
        <Text style={styles.primaryText}>I've confirmed — log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 16, color: '#1a1a1a' },
  body: { fontSize: 16, color: '#333', lineHeight: 23, marginBottom: 12 },
  email: { fontWeight: '700' },
  hint: { fontSize: 14, color: '#777', marginBottom: 32 },
  secondary: { borderWidth: 1, borderColor: '#881c1c', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12, minHeight: 50, justifyContent: 'center' },
  secondaryText: { color: '#881c1c', fontSize: 16, fontWeight: '600' },
  primary: { backgroundColor: '#881c1c', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
