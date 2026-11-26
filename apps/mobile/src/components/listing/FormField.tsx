import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LISTING_COLORS as C } from './formStyles';

interface Props {
  label: string;
  /** Shown under the input when there's no error. */
  helper?: string;
  error?: string;
  /** e.g. "45 / 120" */
  counter?: string;
  counterOver?: boolean;
  children: React.ReactNode;
}

/** Label, input, then the helper text or the error, as in the §2 mockups. */
export default function FormField({ label, helper, error, counter, counterOver, children }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <View style={styles.footer}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : (
          <Text style={styles.helper}>{helper ?? ''}</Text>
        )}
        {counter ? <Text style={[styles.counter, counterOver && styles.counterOver]}>{counter}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  helper: { flex: 1, fontSize: 12, color: C.muted },
  error: { flex: 1, fontSize: 12, color: C.error },
  counter: { fontSize: 12, color: C.muted },
  counterOver: { color: C.error, fontWeight: '600' },
});
