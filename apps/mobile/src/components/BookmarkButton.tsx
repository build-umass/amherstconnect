import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { toggleBookmark } from '../services/bookmarks';
import { useAuth } from '../contexts/AuthContext';

export interface BookmarkButtonProps {
  eventId: string;
  initialBookmarked?: boolean;
  onToggle?: (isBookmarked: boolean) => void;
  size?: number;
  color?: string;
}

export default function BookmarkButton({
  eventId,
  initialBookmarked = false,
  onToggle,
  size = 24,
  color = '#881c1c',
}: BookmarkButtonProps) {
  const { appUser } = useAuth();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (!appUser || loading) return;
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    setLoading(true);
    try {
      const confirmed = await toggleBookmark(appUser.uid, eventId);
      setBookmarked(confirmed);
      onToggle?.(confirmed);
    } catch {
      setBookmarked(!next); // revert on failure
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color={color} style={{ width: size, height: size }} />;
  }

  return (
    <TouchableOpacity onPress={handlePress} style={styles.button} hitSlop={8}>
      <Text style={[styles.icon, { fontSize: size, color: bookmarked ? color : '#aaa' }]}>
        {bookmarked ? '★' : '☆'}
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
