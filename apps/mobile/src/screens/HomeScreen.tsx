import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import FeaturedEventCard from '../components/FeaturedEventCard';
import CategoryFilterBar from '../components/CategoryFilterBar';
import EventCard from '../components/EventCard';
import SearchBar from '../components/SearchBar';
import { useEvents } from '../hooks/useEvents';
import { EventCategory, FeaturedEvent } from '../types/event';
import { useAuth } from '../contexts/AuthContext';
import type { HomeStackParamList } from '../types/navigation';

// ── Featured event (static until Firestore featured query is added) ───────────

const FEATURED_EVENT: FeaturedEvent = {
  id: '1',
  title: 'SASA Bollywood Night',
  date: 'Fri, May 1',
  time: '7:00 PM',
  location: 'Mullins Center',
  interested: 214,
};

function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { appUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const { events: filteredEvents } = useEvents({
    category: selectedCategory,
    search: searchQuery,
  });

  const showFeatured = selectedCategory === 'All' && searchQuery.length === 0;
  const greeting = getGreeting();
  const avatarInitial = appUser?.displayName?.trim()?.[0]?.toUpperCase() ?? '?';

  const ListHeader = (
    <>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.appTitle}>
            Amherst <Text style={styles.appTitleAccent}>Connect</Text>
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search Bar ── */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* ── Featured Tonight ── */}
      {showFeatured && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Tonight</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See All →</Text>
            </TouchableOpacity>
          </View>
          <FeaturedEventCard event={FEATURED_EVENT} />
        </>
      )}

      {/* ── Category Filter ── */}
      <CategoryFilterBar selected={selectedCategory} onSelect={setSelectedCategory} />

      {/* ── Upcoming This Week ── */}
      <View style={[styles.sectionHeader, styles.upcomingHeader]}>
        <Text style={styles.sectionTitle}>Upcoming This Week</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => navigation.navigate('EventDetail', { event: item })}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No events found</Text>
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
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
