import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { EventCardProps, EventCategory } from '../types/event';

const CATEGORY_STYLES: Record<Exclude<EventCategory, 'All'>, { text: string; bg: string }> = {
  Dining:          { text: '#C45C00', bg: '#f4e6d8' },
  Sports:          { text: '#2e61c7', bg: 'rgb(211, 221, 244)' },
  Campus:          { text: '#98190b', bg: '#f0cdcd' },
  Nightlife:       { text: '#5B2A8A', bg: '#bdafcc' },
  'Arts & Music':  { text: '#bd1479', bg: '#e1c4d5' },
};

const FALLBACK = { text: '#555', bg: '#F0F0F0' };

export default function EventCard({ event, onPress }: EventCardProps) {
  const categoryStyle =
    event.category !== 'All'
      ? (CATEGORY_STYLES[event.category as Exclude<EventCategory, 'All'>] ?? FALLBACK)
      : FALLBACK;

  const interestedSuffix =
    event.interested !== undefined
      ? event.interested >= 1000
        ? ` · 👥 ${(event.interested / 1000).toFixed(1)}k`
        : ` · 👥 ${event.interested}`
      : '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.iconBlock, { backgroundColor: categoryStyle.bg }]}>
        <Text style={styles.emoji}>{event.emoji}</Text>
      </View>

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
