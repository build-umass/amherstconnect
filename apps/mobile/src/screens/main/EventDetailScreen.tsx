import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../types/navigation';
import type { EventCategory } from '../../types/event';

type Props = NativeStackScreenProps<HomeStackParamList, 'EventDetail'>;

const CATEGORY_COLORS: Record<Exclude<EventCategory, 'All'>, { text: string; bg: string }> = {
  Dining:         { text: '#C45C00', bg: '#FFF0E0' },
  Sports:         { text: '#2e61c7', bg: '#FFF3E0' },
  Campus:         { text: '#98190b', bg: '#E8F5EE' },
  Nightlife:      { text: '#5B2A8A', bg: '#F3EDF9' },
  'Arts & Music': { text: '#bd1479', bg: '#F9EDF5' },
};

export default function EventDetailScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const [going, setGoing] = useState(false);
  const { top } = useSafeAreaInsets();

  const categoryStyle =
    event.category && event.category !== 'All'
      ? (CATEGORY_COLORS[event.category as Exclude<EventCategory, 'All'>] ?? { text: '#555', bg: '#F0F0F0' })
      : { text: '#555', bg: '#F0F0F0' };

  const categoryLabel =
    event.category && event.category !== 'All' ? event.category : 'Event';

  const interestedLabel =
    event.interested !== undefined
      ? event.interested >= 1000
        ? `👥 ${(event.interested / 1000).toFixed(1)}k interested`
        : `👥 ${event.interested} interested`
      : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>

      {/* ── Hero ── */}
      <View style={styles.hero}>

        <TouchableOpacity
          style={[styles.heroBtn, styles.backBtn, { top: top + 12 }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.heroBtnText}>‹</Text>
        </TouchableOpacity>

        {/* Right icons: share + bookmark */}
        <View style={[styles.heroRight, { top: top + 12 }]}>
          <TouchableOpacity style={styles.heroBtn}>
            <Text style={styles.heroBtnText}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroBtn}>
            <Text style={styles.heroBtnText}>🔖</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.emojiWrapper, { backgroundColor: categoryStyle.bg }]}>
          <Text style={styles.heroEmoji}>{event.emoji ?? '📅'}</Text>
        </View>

        <View style={styles.badges}>
          {event.isFeatured && (
            <View style={styles.badgeTonight}>
              <Text style={styles.badgeTonightText}>TONIGHT</Text>
            </View>
          )}
          {event.isFree && (
            <View style={styles.badgeFree}>
              <Text style={styles.badgeFreeText}>FREE</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Category chip ── */}
        <View style={[styles.categoryChip, { borderColor: categoryStyle.text }]}>
          <Text style={[styles.categoryChipText, { color: categoryStyle.text }]}>
            {categoryLabel}
          </Text>
        </View>

        {/* ── Title ── */}
        <Text style={styles.title}>{event.title}</Text>

        {/* ── Organizer + interested ── */}
        <Text style={styles.organizerLine}>
          {event.organizer ? (
            <>by <Text style={styles.organizerName}>{event.organizer}</Text></>
          ) : null}
          {event.organizer && interestedLabel ? '  ·  ' : ''}
          {interestedLabel ?? ''}
        </Text>

        {/* ── Meta card ── */}
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📅</Text>
            <View style={styles.metaLabelGroup}>
              <Text style={styles.metaLabel}>DATE</Text>
              <Text style={styles.metaValue}>{event.date}</Text>
            </View>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>🕐</Text>
            <View style={styles.metaLabelGroup}>
              <Text style={styles.metaLabel}>TIME</Text>
              <Text style={styles.metaValue}>{event.time}</Text>
            </View>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <View style={styles.metaLabelGroup}>
              <Text style={styles.metaLabel}>LOCATION</Text>
              <Text style={styles.metaValue}>{event.location}</Text>
            </View>
          </View>
        </View>

        {/* ── About ── */}
        {event.description && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About this event</Text>
            <Text style={styles.description}>{event.description}</Text>
          </View>
        )}

        {/* ── Getting There ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Getting There</Text>
          <Text style={styles.locationLine}>📍 {event.location}, UMass Amherst</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Footer: two buttons side by side ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.rsvpBtn, going && styles.rsvpBtnActive]}
          onPress={() => setGoing((prev) => !prev)}
          activeOpacity={0.85}
        >
          <Text style={styles.rsvpBtnText}>
            {going ? '✓ Going' : 'RSVP?'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => navigation.getParent()?.navigate('Map', { highlightedEventId: event.id })}
          activeOpacity={0.85}
        >
          <Text style={styles.mapBtnText}>View on Map</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: '#1A2B4A',
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
  },
  heroRight: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  heroBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  emojiWrapper: {
    width: 88,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 14,
  },
  heroEmoji: {
    fontSize: 44,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeTonight: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeTonightText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeFree: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeFreeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Category chip
  categoryChip: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Title
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
    lineHeight: 32,
    marginBottom: 6,
  },

  // Organizer
  organizerLine: {
    fontSize: 13,
    color: '#888',
    marginBottom: 18,
  },
  organizerName: {
    fontWeight: '700',
    color: '#555',
  },

  // Meta card
  metaCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  metaDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 36,
  },
  metaIcon: {
    fontSize: 20,
    width: 22,
    textAlign: 'center',
  },
  metaLabelGroup: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#AAAAAA',
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },

  // Section cards
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  locationLine: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  rsvpBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2D7A45',
    backgroundColor: 'transparent',
  },
  rsvpBtnActive: {
    backgroundColor: '#E8F5EE',
  },
  rsvpBtnText: {
    color: '#2D7A45',
    fontSize: 15,
    fontWeight: '700',
  },
  mapBtn: {
    flex: 1,
    backgroundColor: '#8B1A1A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  mapBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
