import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { DealCategory } from '../types/deal';
 
const CATEGORIES: Array<'All' | DealCategory> = [
  'All',
  'dining',
  'coffee',
  'retail',
  'nightlife',
];
 
interface Props {
  selected: 'All' | DealCategory;
  onSelect: (category: 'All' | DealCategory) => void;
}
 
export default function DealCategoryFilterBar({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scrollView}
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
              {category === 'All'
                ? 'All'
                : category.charAt(0).toUpperCase() + category.slice(1)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
 
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollView: {
  flexGrow: 0,
  flexShrink: 1,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#8B1A1A',
    borderColor: '#8B1A1A',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#444',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
 