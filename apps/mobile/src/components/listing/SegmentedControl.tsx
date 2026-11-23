import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LISTING_COLORS as C } from './formStyles';

interface Props<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  selected: { backgroundColor: C.maroonTint },
  text: { fontSize: 15, color: C.muted },
  selectedText: { color: C.maroon, fontWeight: '600' },
});
