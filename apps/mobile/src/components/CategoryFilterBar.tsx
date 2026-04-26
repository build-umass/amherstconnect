import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

export type Category = 'All' | 'Campus' | 'Dining' | 'Sports' | 'Nightlife' | 'Arts & Music';

export const CATEGORIES: Category[] = [
  'All',
  'Campus',
  'Dining',
  'Sports',
  'Nightlife',
  'Arts & Music',
];

interface Props {
  selected: Category;
  onSelect: (category: Category) => void;
}

export default function CategoryFilterBar({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {CATEGORIES.map((category) => {
        const isActive = selected === category;
        return (
          <TouchableOpacity
            key={category}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(category)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {category}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 4,
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
    backgroundColor: '#8B1A1A',
    borderColor: '#8B1A1A',
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
