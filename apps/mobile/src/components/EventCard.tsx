
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
import { EventCardProps, EventCategory } from '../types/event';

const CATEGORY_STYLES: Record<Exclude<EventCategory, 'All'>, { text: string; bg: string }> = {
  'Talks & Lectures':    { text: '#2E61C7', bg: '#E8EEFA' },
  'Workshops & Classes': { text: '#0F7B6C', bg: '#E3F2EF' },
  'Arts & Culture':      { text: '#BD1479', bg: '#F9E6F0' },
  'Sports & Recreation': { text: '#2E8B3D', bg: '#E6F3E8' },
  'Career & Networking': { text: '#5B2A8A', bg: '#EFE8F5' },
  'Health & Wellness':   { text: '#0E8FA8', bg: '#E2F3F7' },
  'Social & Community':  { text: '#98190B', bg: '#F8E6E4' },
  'Food & Drink':        { text: '#C45C00', bg: '#FBEEE3' },
};

const CATEGORY_ICONS = {
  'Talks & Lectures': 'mic',
  'Workshops & Classes': 'book-open',
  'Arts & Culture': 'palette',
  'Sports & Recreation': 'trophy',
  'Career & Networking': 'briefcase-business',
  'Health & Wellness': 'heart-pulse',
  'Social & Community': 'users',
  'Food & Drink': 'utensils',
} as const;

const FALLBACK = { text: '#555', bg: '#F0F0F0' };

export default function EventCard({ event, onPress }: EventCardProps) {
  const categoryStyle =
    event.category !== 'All'
      ? (CATEGORY_STYLES[event.category] ?? FALLBACK)
      : FALLBACK;

  const categoryIcon =
    event.category === 'All'
      ? 'calendar'
      : CATEGORY_ICONS[event.category];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.iconBlock, { backgroundColor: categoryStyle.bg }]}>
        <Lucide
          name={categoryIcon}
          size={26}
          color={categoryStyle.text}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.category, { color: categoryStyle.text }]}>
          {event.category}
        </Text>

        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Lucide name="calendar" size={13} color="#666" />
          <Text style={styles.meta}>{event.date}</Text>
          <Text style={styles.meta}>·</Text>
          <Lucide name="clock" size={13} color="#666" />
          <Text style={styles.meta}>{event.time}</Text>
        </View>

        <View style={styles.metaRow}>
          <Lucide name="map-pin" size={13} color="#666" />
          <Text style={styles.meta}>{event.location}</Text>
        </View>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: 12,
    color: '#666',
  },
});
