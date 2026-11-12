import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import googleLogo from '../../assets/images/google-g-logo.svg';

// Google sign-in button below the email form on Login and Sign Up, styled per
// Google's Sign in with Google branding guidelines (light theme): white fill,
// 1px #747775 stroke, #1F1F1F medium-weight text, and the unmodified
// four-color "G" at 20x20. Padding and logo gap follow the per-platform spec.
// Height and corner radius match the app's other auth buttons.
const LABELS = {
  signUp: 'Sign up with Google',
  logIn: 'Log in with Google',
} as const;

export default function GoogleSignInButton({
  mode,
  onPress,
  loading,
  disabled,
}: {
  mode: keyof typeof LABELS;
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  const label = LABELS[mode];
  return (
    <>
      <Text style={styles.divider}>— or —</Text>
      <TouchableOpacity
        style={[styles.button, disabled && !loading && styles.disabled]}
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {loading ? (
          <ActivityIndicator color="#1F1F1F" />
        ) : (
          <View style={styles.content}>
            <Image source={googleLogo} style={styles.logo} contentFit="contain" accessible={false} />
            <Text style={styles.text}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    </>
  );
}

const spec = Platform.select({
  ios: { padding: 16, gap: 12 },
  default: { padding: 12, gap: 10 },
});

const styles = StyleSheet.create({
  divider: { textAlign: 'center', color: '#999', marginVertical: 16 },
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#747775',
    borderRadius: 10,
    paddingHorizontal: spec.padding,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spec.gap },
  logo: { width: 20, height: 20 },
  text: { fontSize: 16, fontWeight: '500', color: '#1F1F1F' },
});
