import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
import type { CategoryOption } from '../../types/listing';
import { LISTING_COLORS as C } from './formStyles';

interface Props {
  categories: readonly CategoryOption[];
  selectedIds: readonly string[];
  /** Events pick several; deals pick one. */
  multiple: boolean;
  onToggle: (id: string) => void;
  hasError?: boolean;
}

/** Category chips: multi-select for events, single-select for deals. */
export default function CategoryPicker({ categories, selectedIds, multiple, onToggle, hasError }: Props) {
  return (
    <View
      style={[styles.wrap, hasError && styles.wrapError]}
      accessibilityRole={multiple ? undefined : 'radiogroup'}
    >
      {categories.map((c) => {
        const selected = selectedIds.includes(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => onToggle(c.id)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: selected } : { selected }}
          >
            {selected ? <Lucide name="check" size={14} color={C.maroon} /> : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderRadius: 8 },
  wrapError: { borderWidth: 1, borderColor: C.error, padding: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  chipSelected: { backgroundColor: C.maroonTint, borderColor: C.maroon },
  chipText: { fontSize: 14, color: C.text },
  chipTextSelected: { color: C.maroon, fontWeight: '600' },
});
