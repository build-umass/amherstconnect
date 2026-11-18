
import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
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
  const { isBookmarked, loading, mutating, error, toggle } = useBookmark(eventId);

  // Failed loads and toggles revert the star, so say why instead of failing silently.
  useEffect(() => {
    if (!error) return;
    console.warn('[BookmarkButton]', eventId, error);
    Alert.alert('Bookmark failed', error);
  }, [error, eventId]);

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
      <Lucide
        name="star"
        size={size}
        color={isBookmarked ? color : '#aaa'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
