import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import type { Event, EventCategory } from '../../types/event';

// ─── Constants ─────────────────────────────────────────────────

const UMASS_REGION = {
  latitude: 42.3868,
  longitude: -72.5301,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

const CATEGORY_COLOR: Record<EventCategory, string> = {
  dining:    '#ef4444',
  music:     '#8b5cf6',
  sports:    '#22c55e',
  cultural:  '#f97316',
  rso:       '#3b82f6',
  arts:      '#ec4899',
  academic:  '#06b6d4',
  nightlife: '#111111',
  fitness:   '#eab308',
};

const CATEGORY_ICON: Record<EventCategory, string> = {
  dining:    '🍴',
  music:     '🎵',
  sports:    '🏆',
  cultural:  '🌐',
  rso:       '👥',
  arts:      '🎨',
  academic:  '📚',
  nightlife: '⚡',
  fitness:   '💪',
};

// ─── Dummy Data ─────────────────────────────────────────────────
// Real UMass building coordinates
// Replace this array with a Firestore query later

const DUMMY_EVENTS: Event[] = [
  {
    id: '1',
    organizerId: 'org_sasa',
    title: 'SASA Bollywood Night',
    description: 'A night of Bollywood music and dance.',
    location: 'Bowker Auditorium',
    latitude: 42.3914,
    longitude: -72.5262,
    startTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 4 * 60 * 60 * 1000),
    category: 'cultural',
    coverImageUrl: null,
    isFeatured: true,
    rsvpLimit: 200,
    createdAt: new Date(),
  },
  {
    id: '2',
    organizerId: 'org_athletics',
    title: 'Varsity Basketball vs URI',
    description: 'Come support the Minutemen!',
    location: 'Mullins Center',
    latitude: 42.3960,
    longitude: -72.5315,
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 4 * 60 * 60 * 1000),
    category: 'sports',
    coverImageUrl: null,
    isFeatured: false,
    rsvpLimit: null,
    createdAt: new Date(),
  },
  {
    id: '3',
    organizerId: 'org_dining',
    title: 'Lunar New Year Dinner',
    description: 'Celebrate with traditional dishes.',
    location: 'Worcester Dining Commons',
    latitude: 42.3878,
    longitude: -72.5348,
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 5 * 60 * 60 * 1000),
    category: 'dining',
    coverImageUrl: null,
    isFeatured: false,
    rsvpLimit: 150,
    createdAt: new Date(),
  },
  {
    id: '4',
    organizerId: 'org_fac',
    title: 'Campus Arts Showcase',
    description: 'Student art and live performances.',
    location: 'Fine Arts Center',
    latitude: 42.3927,
    longitude: -72.5198,
    startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 7 * 60 * 60 * 1000),
    category: 'arts',
    coverImageUrl: null,
    isFeatured: false,
    rsvpLimit: null,
    createdAt: new Date(),
  },
  {
    id: '5',
    organizerId: 'org_isenberg',
    title: 'Spring Startup Pitch Night',
    description: 'Student founders pitch to investors.',
    location: 'Isenberg School of Management',
    latitude: 42.3893,
    longitude: -72.5274,
    startTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 8 * 60 * 60 * 1000),
    category: 'academic',
    coverImageUrl: null,
    isFeatured: false,
    rsvpLimit: 80,
    createdAt: new Date(),
  },
  {
    id: '6',
    organizerId: 'org_rso',
    title: 'RSO Fair — Spring Edition',
    description: 'Discover and join student organizations.',
    location: 'Campus Center',
    latitude: 42.3896,
    longitude: -72.5281,
    startTime: new Date(Date.now() + 0.5 * 60 * 60 * 1000),
    endTime:   new Date(Date.now() + 3 * 60 * 60 * 1000),
    category: 'rso',
    coverImageUrl: null,
    isFeatured: false,
    rsvpLimit: null,
    createdAt: new Date(),
  },
];

// ─── Helper Functions ───────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDistanceMetres(
  userLat: number,
  userLon: number,
  eventLat: number,
  eventLon: number,
): number {
  const R = 6371e3;
  const p1 = (userLat * Math.PI) / 180;
  const p2 = (eventLat * Math.PI) / 180;
  const dp = ((eventLat - userLat) * Math.PI) / 180;
  const dl = ((eventLon - userLon) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getWalkingMinutes(metres: number): number {
  return Math.round(metres / 80);
}

function openDirections(event: Event) {
  const label = encodeURIComponent(event.title);
  const { latitude, longitude } = event;

  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${label}@${latitude},${longitude}`
      : `geo:0,0?q=${latitude},${longitude}(${label})`;

  Linking.openURL(url);
}

// ─── Component ──────────────────────────────────────────────────

type UserLocation = {
  latitude: number;
  longitude: number;
};

export default function InteractiveMap() {
const mapRef = useRef<any>(null);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [userLocation, setUserLocation]   = useState<UserLocation | null>(null);

  useEffect(() => {
    requestLocation();
  }, []);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const result = await Location.getCurrentPositionAsync({});
    setUserLocation({
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
    });
  }

  function handlePinPress(event: Event) {
    setSelectedEvent(event);
    mapRef.current?.animateToRegion(
      {
        latitude:      event.latitude,
        longitude:     event.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      400,
    );
  }

  function handleMapPress() {
    setSelectedEvent(null);
  }

  function getWalkLabel(event: Event): string {
    if (!userLocation) return '';
    const metres = getDistanceMetres(
      userLocation.latitude,
      userLocation.longitude,
      event.latitude,
      event.longitude,
    );
    return `${getWalkingMinutes(metres)} min walk`;
  }

  return (
    <View style={styles.container}>
      <Header />
      <FilterChips />
      <Map
        mapRef={mapRef}
        events={DUMMY_EVENTS}
        selectedEvent={selectedEvent}
        userLocation={userLocation}
        onPinPress={handlePinPress}
        onMapPress={handleMapPress}
      />
      {selectedEvent ? (
        <EventPreviewCard
          event={selectedEvent}
          walkLabel={getWalkLabel(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
          onDirections={() => openDirections(selectedEvent)}
        />
      ) : (
        <NearbyPanel
          events={DUMMY_EVENTS}
          userLocation={userLocation}
          onCardPress={handlePinPress}
          getWalkLabel={getWalkLabel}
        />
      )}
    </View>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>LIVE CAMPUS MAP</Text>
    </View>
  );
}

function FilterChips() {
  // Filter state lives here — will wire to map data when Firestore is added
  const filters = ['Now', 'Today', 'This Week', 'Campus'];
  const [active, setActive] = useState('Today');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {filters.map(f => (
        <TouchableOpacity
          key={f}
          style={[styles.chip, active === f && styles.chipActive]}
          onPress={() => setActive(f)}
        >
          <Text style={[styles.chipText, active === f && styles.chipTextActive]}>
            {f}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

type MapProps = {
  mapRef: React.RefObject<any>;
  events: Event[];
  selectedEvent: Event | null;
  userLocation: UserLocation | null;
  onPinPress: (event: Event) => void;
  onMapPress: () => void;
};

function Map({
  mapRef,
  events,
  selectedEvent,
  userLocation,
  onPinPress,
  onMapPress,
}: MapProps) {
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={UMASS_REGION}
      showsUserLocation={userLocation !== null}
      showsMyLocationButton={userLocation !== null}
      onPress={onMapPress}
    >
      {events.map(event => (
        <Marker
          key={event.id}
          coordinate={{ latitude: event.latitude, longitude: event.longitude }}
          onPress={() => onPinPress(event)}
          tracksViewChanges={false}
        >
          <View style={[
            styles.pin,
            { backgroundColor: CATEGORY_COLOR[event.category] },
            selectedEvent?.id === event.id && styles.pinSelected,
          ]}>
            <Text style={styles.pinEmoji}>
              {CATEGORY_ICON[event.category]}
            </Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

type EventPreviewCardProps = {
  event: Event;
  walkLabel: string;
  onClose: () => void;
  onDirections: () => void;
};

function EventPreviewCard({
  event,
  walkLabel,
  onClose,
  onDirections,
}: EventPreviewCardProps) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHandle} />

      <View style={styles.previewTopRow}>
        <View style={[
          styles.catBadge,
          { backgroundColor: CATEGORY_COLOR[event.category] + '20' },
        ]}>
          <Text style={[
            styles.catBadgeText,
            { color: CATEGORY_COLOR[event.category] },
          ]}>
            {CATEGORY_ICON[event.category]}  {event.category}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.previewTitle}>{event.title}</Text>

      <Text style={styles.previewMeta}>
        🕐 {formatTime(event.startTime)}   📍 {event.location}
        {walkLabel ? `   🚶 ${walkLabel}` : ''}
      </Text>

      <View style={styles.previewActions}>
        <TouchableOpacity style={styles.outlineBtn} onPress={onDirections}>
          <Text style={styles.outlineBtnText}>Get Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.solidBtn}>
          <Text style={styles.solidBtnText}>View Event →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type NearbyPanelProps = {
  events: Event[];
  userLocation: UserLocation | null;
  onCardPress: (event: Event) => void;
  getWalkLabel: (event: Event) => string;
};

function NearbyPanel({
  events,
  userLocation,
  onCardPress,
  getWalkLabel,
}: NearbyPanelProps) {
  return (
    <View style={styles.nearbyPanel}>
      <View style={styles.nearbyHeaderRow}>
        <View>
          <Text style={styles.nearbyTitle}>Nearby Happening</Text>
          <Text style={styles.nearbySub}>
            {userLocation
              ? 'Within 10 mins walk from you'
              : 'Upcoming events on campus'}
          </Text>
        </View>
        <Text style={styles.seeAll}>See List ›</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.nearbyScroll}
      >
        {events.map(event => (
          <TouchableOpacity
            key={event.id}
            style={styles.nearbyCard}
            onPress={() => onCardPress(event)}
            activeOpacity={0.85}
          >
            <View style={[
              styles.nearbyCardImg,
              { backgroundColor: CATEGORY_COLOR[event.category] },
            ]}>
              <Text style={styles.nearbyCardEmoji}>
                {CATEGORY_ICON[event.category]}
              </Text>
              {userLocation && (
                <View style={styles.walkBadge}>
                  <Text style={styles.walkBadgeText}>
                    🚶 {getWalkLabel(event)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.nearbyCardInfo}>
              <Text style={styles.nearbyCardName} numberOfLines={2}>
                {event.title}
              </Text>
              <Text style={styles.nearbyCardTime}>
                {formatTime(event.startTime)}
              </Text>
              <Text style={styles.nearbyCardLoc} numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const ORANGE = '#E8460A';

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },

  // Header
  header:           { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10 },
  headerTitle:      { fontSize: 13, fontWeight: '800', letterSpacing: 2, color: '#111' },

  // Filter chips
  filterRow:        { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
  chip:             { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e5e5' },
  chipActive:       { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText:         { fontSize: 13, fontWeight: '500', color: '#555' },
  chipTextActive:   { color: '#fff' },

  // Map
  map:              { flex: 1 },

  // Pins
  pin:              { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  pinSelected:      { width: 52, height: 52, borderRadius: 26, borderWidth: 3 },
  pinEmoji:         { fontSize: 18 },

  // Preview card
  previewCard:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 10 },
  previewHandle:    { width: 40, height: 4, backgroundColor: '#e5e5e5', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  previewTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  catBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  catBadgeText:     { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  closeBtn:         { fontSize: 18, color: '#aaa' },
  previewTitle:     { fontSize: 19, fontWeight: '800', color: '#111', marginBottom: 8 },
  previewMeta:      { fontSize: 12, color: '#555', marginBottom: 16, lineHeight: 18 },
  previewActions:   { flexDirection: 'row', gap: 12 },
  outlineBtn:       { flex: 1, borderWidth: 1.5, borderColor: ORANGE, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  outlineBtnText:   { color: ORANGE, fontWeight: '700', fontSize: 14 },
  solidBtn:         { flex: 1, backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  solidBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Nearby panel
  nearbyPanel:      { backgroundColor: '#fff', paddingTop: 16, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 6 },
  nearbyHeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 14 },
  nearbyTitle:      { fontSize: 16, fontWeight: '800', color: '#111' },
  nearbySub:        { fontSize: 11, color: '#999', marginTop: 3 },
  seeAll:           { fontSize: 12, color: ORANGE, fontWeight: '600' },
  nearbyScroll:     { paddingHorizontal: 20, gap: 12 },
  nearbyCard:       { width: 155, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#ebebeb' },
  nearbyCardImg:    { height: 90, alignItems: 'center', justifyContent: 'center' },
  nearbyCardEmoji:  { fontSize: 32 },
  walkBadge:        { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  walkBadgeText:    { fontSize: 9, color: '#fff', fontWeight: '600' },
  nearbyCardInfo:   { padding: 10, backgroundColor: '#fff' },
  nearbyCardName:   { fontSize: 12, fontWeight: '700', color: '#111', marginBottom: 3, lineHeight: 16 },
  nearbyCardTime:   { fontSize: 11, color: ORANGE, fontWeight: '600', marginBottom: 2 },
  nearbyCardLoc:    { fontSize: 10, color: '#999' },
});