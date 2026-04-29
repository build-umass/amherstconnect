import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import EventCard from '../EventCard';
import type { Event } from '../../types/event';

export interface NearbyScrollListProps {
  events: Event[];
  userLocationAvailable: boolean;
  getWalkLabel: (event: Event) => string;
  onCardPress: (event: Event) => void;
}

export default function NearbyScrollList({
  events,
  userLocationAvailable,
  getWalkLabel,
  onCardPress,
}: NearbyScrollListProps) {
  return (
    <View style={styles.panel}>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Nearby Happening</Text>
          <Text style={styles.sub}>
            {userLocationAvailable
              ? 'Within 10 mins walk from you'
              : 'Upcoming events on campus'}
          </Text>
        </View>
        <Text style={styles.seeAll}>See List ›</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {events.map(event => (
          <View key={event.id} style={styles.cardWrapper}>
            <EventCard
              event={event}
              onPress={() => onCardPress(event)}
            />
            {userLocationAvailable && (
              <Text style={styles.walkLabel}>
                🚶 {getWalkLabel(event)}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

    </View>
  );
}

const MAROON = '#8B1A1A';

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    paddingTop: 16,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  title:       { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  sub:         { fontSize: 11, color: '#999', marginTop: 3 },
  seeAll:      { fontSize: 12, color: MAROON, fontWeight: '600' },
  scroll:      { paddingHorizontal: 20, gap: 12 },
  cardWrapper: { width: 220 },
  walkLabel:   { fontSize: 11, color: MAROON, fontWeight: '600', paddingHorizontal: 14, marginTop: 4 },
});