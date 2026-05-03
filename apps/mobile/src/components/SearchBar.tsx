import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SearchBarProps } from '../types/event';

const DEBOUNCE_MS = 300;

export default function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if parent resets value externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleChange(text: string) {
    setLocalValue(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(text), DEBOUNCE_MS);
  }

  function handleClear() {
    setLocalValue('');
    if (timer.current) clearTimeout(timer.current);
    onChange('');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={localValue}
        onChangeText={handleChange}
        placeholder={placeholder ?? 'Search events, places, deals...'}
        placeholderTextColor="#AAAAAA"
        returnKeyType="search"
        clearButtonMode="never"
      />
      {localValue.length > 0 && (
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  icon: {
    fontSize: 15,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },
  clearIcon: {
    fontSize: 13,
    color: '#AAAAAA',
    fontWeight: '600',
  },
});
