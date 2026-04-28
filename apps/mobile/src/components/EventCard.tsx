import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Event, EventCardProps } from '../types/event';

const CATEGORY_STYLES: Record<string, { text: string; bg: string }> = {
  Dining:          { text: '#C45C00', bg: '#FFF0E0' },
  Sports:          { text: '#C06000', bg: '#FFF3E0' },
  Campus:          { text: '#1A6B3A', bg: '#E8F5EE' },
  Nightlife:       { text: '#5B2A8A', bg: '#F3EDF9' },
  'Arts & Music':  { text: '#8A2A6A', bg: '#F9EDF5' },
};

const FALLBACK = { text: '#555', bg: '#F0F0F0' };

export default function EventCard({ event, onPress }: EventCardProps) {
  const categoryStyle = CATEGORY_STYLES[event.category] ?? FALLBACK;

  const interestedSuffix =
    event.interested !== undefined
      ? event.interested >= 1000
        ? ` · 👥 ${(event.interested / 1000).toFixed(1)}k`
        : ` · 👥 ${event.interested}`
      : '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Emoji icon */}
      <View style={[styles.iconBlock, { backgroundColor: categoryStyle.bg }]}>
        <Text style={styles.emoji}>{event.emoji}</Text>
      </View>

      {/* Text */}
      <View style={styles.content}>
        <Text style={[styles.category, { color: categoryStyle.text }]}>
          {event.category}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.meta}>
          📅 {event.date} · 🕐 {event.time}
        </Text>
        <Text style={styles.meta}>
          📍 {event.location}{interestedSuffix}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  iconBlock: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: {
    fontSize: 26,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  category: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  meta: {
    fontSize: 12,
    color: '#666',
  },
});
