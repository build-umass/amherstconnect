import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface FeaturedEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  interested: number;
}

interface Props {
  event: FeaturedEvent;
  onPress?: () => void;
}

export default function FeaturedEventCard({ event, onPress }: Props) {
  const interestedLabel =
    event.interested >= 1000
      ? `${(event.interested / 1000).toFixed(1)}k`
      : `${event.interested}`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* Navy image area */}
      <View style={styles.imageArea}>
        <Text style={styles.illustration}>🎭</Text>
        <View style={styles.tonightBadge}>
          <Text style={styles.tonightText}>TONIGHT</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoArea}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>📅 {event.date}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaItem}>🕐 {event.time}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>📍 {event.location}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaItem}>👥 {interestedLabel} interested</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  imageArea: {
    height: 140,
    backgroundColor: '#1E3263',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    fontSize: 56,
  },
  tonightBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#F0A030',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tonightText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  infoArea: {
    padding: 14,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaItem: {
    fontSize: 12,
    color: '#555',
  },
  metaDot: {
    fontSize: 12,
    color: '#bbb',
  },
});
