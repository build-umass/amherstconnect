import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import FeaturedEventCard, { FeaturedEvent } from '../components/FeaturedEventCard';
import CategoryFilterBar, { Category } from '../components/CategoryFilterBar';
import EventCard from '../components/EventCard';
import { Event } from '../types/event';

// ── Mock data ─────────────────────────────────────────────────────────────────

const FEATURED_EVENT: FeaturedEvent = {
  id: '1',
  title: 'SASA Bollywood Night',
  date: 'Fri, Apr 25',
  time: '7:00 PM',
  location: 'Mullins Center',
  interested: 214,
};

const ALL_EVENTS: Event[] = [
  {
    id: '2',
    title: 'Lunar New Year Festival',
    category: 'Dining',
    date: 'Sat, Apr 26',
    time: '4:30 PM',
    location: 'Worcester Dining Commons',
    emoji: '🍜',
  },
  {
    id: '3',
    title: 'UMass vs. UConn Basketball',
    category: 'Sports',
    date: 'Sun, Apr 27',
    time: '7:00 PM',
    location: 'Mullins Center',
    emoji: '🏀',
    interested: 1200,
  },
  {
    id: '4',
    title: 'Fine Arts Gala 2025',
    category: 'Arts & Music',
    date: 'Sat, Apr 26',
    time: '5:00 PM',
    location: 'Fine Arts Center',
    emoji: '🎨',
  },
  {
    id: '5',
    title: 'Campus Farmer\'s Market',
    category: 'Campus',
    date: 'Sat, Apr 26',
    time: '12:00 PM',
    location: 'Campus Pond',
    emoji: '🌿',
  },
  {
    id: '6',
    title: 'Late Night Comedy Show',
    category: 'Nightlife',
    date: 'Fri, Apr 25',
    time: '9:30 PM',
    location: 'Amherst Coffee',
    emoji: '🎤',
  },
];

// ──────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = ALL_EVENTS.filter((e) => {
    const matchesCategory = selectedCategory === 'All' || e.category === selectedCategory;
    const matchesSearch =
      searchQuery.length === 0 ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good evening 👋</Text>
            <Text style={styles.appTitle}>
              Amherst <Text style={styles.appTitleAccent}>Connect</Text>
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn}>
              <Text style={styles.iconBtnText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatar}>
              <Text style={styles.avatarText}>J</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Search Bar ── */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search events, places, deals..."
            placeholderTextColor="#AAAAAA"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* ── Featured Tonight ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Tonight</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>See All →</Text>
          </TouchableOpacity>
        </View>
        <FeaturedEventCard event={FEATURED_EVENT} />

        {/* ── Category Filter ── */}
        <CategoryFilterBar selected={selectedCategory} onSelect={setSelectedCategory} />

        {/* ── Upcoming This Week ── */}
        <View style={[styles.sectionHeader, styles.upcomingHeader]}>
          <Text style={styles.sectionTitle}>Upcoming This Week</Text>
        </View>

        {filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No events found</Text>
          </View>
        ) : (
          filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 13,
    color: '#888',
    fontWeight: '400',
    marginBottom: 2,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  appTitleAccent: {
    color: '#8B1A1A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  iconBtnText: {
    fontSize: 17,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E87722',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Search
  searchContainer: {
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
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  upcomingHeader: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  seeAll: {
    fontSize: 13,
    color: '#8B1A1A',
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#aaa',
  },
});
