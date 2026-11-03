import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

// "Continue with Google" below the email form on Login and Sign Up.
export default function GoogleSignInButton({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Text style={styles.divider}>— or —</Text>
      <TouchableOpacity
        style={[styles.button, disabled && !loading && styles.disabled]}
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
      >
        {loading ? <ActivityIndicator color="#881c1c" /> : <Text style={styles.text}>Continue with Google</Text>}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { textAlign: 'center', color: '#999', marginVertical: 16 },
  button: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 14, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  text: { fontSize: 16, fontWeight: '500', color: '#1a1a1a' },
});
