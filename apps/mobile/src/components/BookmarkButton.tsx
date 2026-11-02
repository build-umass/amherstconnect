import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useBookmark } from '../hooks/useBookmarks';

export interface BookmarkButtonProps {
  eventId: string;
  size?: number;
  color?: string;
}

export default function BookmarkButton({
  eventId,
  size = 24,
  color = '#881c1c',
}: BookmarkButtonProps) {
  const { isBookmarked, loading, mutating, toggle } = useBookmark(eventId);

  if (loading || mutating) {
    return <ActivityIndicator size="small" color={color} style={{ width: size, height: size }} />;
  }

  return (
    <TouchableOpacity
      onPress={() => void toggle()}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isBookmarked ? 'Remove saved event' : 'Save event'}
      accessibilityState={{ selected: isBookmarked }}
    >
      <Text style={[styles.icon, { fontSize: size, color: isBookmarked ? color : '#aaa' }]}>
        {isBookmarked ? '\u2605' : '\u2606'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
  icon: {
    lineHeight: undefined,
  },
});
