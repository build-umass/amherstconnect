import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

export const TIME_FILTERS = ['Now', 'Today', 'This Week', 'Campus'] as const;
export type TimeFilter = typeof TIME_FILTERS[number];

export interface TimeFilterBarProps {
  value: TimeFilter;
  onChange: (filter: TimeFilter) => void;
}

export default function TimeFilterBar({ value, onChange }: TimeFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TIME_FILTERS.map(f => (
        <TouchableOpacity
          key={f}
          style={[styles.chip, value === f && styles.chipActive]}
          onPress={() => onChange(f)}
          activeOpacity={0.7}
        >
          <Text style={[styles.chipText, value === f && styles.chipTextActive]}>
            {f}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const MAROON = '#8B1A1A';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: MAROON,
    borderColor: MAROON,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});