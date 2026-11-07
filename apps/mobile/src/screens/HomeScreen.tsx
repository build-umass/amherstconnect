import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CategoryFilterBar from '../components/CategoryFilterBar';
import EventCard from '../components/EventCard';
import SearchBar from '../components/SearchBar';
import { useEventFeed } from '../hooks/useEventFeed';
import { MAP_CATEGORY_SLUGS, categoryForSlug } from '../services/mapEvents';
import { EventCategory } from '../types/event';
import { useAuth } from '../contexts/AuthContext';
import type { HomeStackParamList } from '../types/navigation';

const HOME_CATEGORIES: EventCategory[] = ['All', ...MAP_CATEGORY_SLUGS.map(slug => categoryForSlug(slug).category)];

function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categorySlug = MAP_CATEGORY_SLUGS.find(slug => categoryForSlug(slug).category === selectedCategory) ?? null;
  const feed = useEventFeed({ categorySlug, search: searchQuery });

  const greeting = getGreeting();
  const avatarInitial = profile?.displayName?.trim()?.[0]?.toUpperCase() ?? '?';

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

      {/* ── Category Filter ── */}
      <CategoryFilterBar categories={HOME_CATEGORIES} selected={selectedCategory} onSelect={setSelectedCategory} />

      {/* ── Upcoming events ── */}
      <View style={[styles.sectionHeader, styles.upcomingHeader]}>
        <Text style={styles.sectionTitle}>Upcoming events</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={feed.events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => navigation.navigate('EventDetail', { eventId: item.id, occurrenceId: item.occurrenceId, event: item })}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {feed.status === 'loading' ? <ActivityIndicator accessibilityLabel="Loading events" color="#881c1c" /> : (
              <>
                <Text style={styles.emptyText} accessibilityRole={feed.status === 'error' ? 'alert' : undefined}>
                  {feed.status === 'error' ? "Couldn't load events" : 'No upcoming events found'}
                </Text>
                {feed.status === 'error' && <>
                  <Text style={styles.emptyText}>{feed.error}</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={feed.refresh} style={styles.iconBtn}>
                    <Text>Try again</Text>
                  </TouchableOpacity>
                </>}
              </>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.emptyState}>
            {feed.loadingMore ? <ActivityIndicator accessibilityLabel="Loading more events" color="#881c1c" /> : (
              <>
                {feed.loadMoreError && <Text accessibilityRole="alert" style={styles.emptyText}>{feed.loadMoreError}</Text>}
                {feed.hasMore && <TouchableOpacity accessibilityRole="button" onPress={feed.loadMore}>
                  <Text>{feed.loadMoreError ? 'Retry loading more' : 'Load more events'}</Text>
                </TouchableOpacity>}
              </>
            )}
          </View>
        }
        onRefresh={feed.refresh}
        refreshing={feed.status === 'loading'}
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
