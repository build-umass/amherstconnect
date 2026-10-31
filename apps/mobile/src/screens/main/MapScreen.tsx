import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../../types/navigation';
import type { Event } from '../../types/event';
import TimeFilterBar, { TimeFilter } from '../../components/map/TimeFilterBar';
import EventPreviewSheet from '../../components/map/EventPreviewSheet';
import NearbyScrollList from '../../components/map/NearbyScrollList';
import { useNearbyEvents, getWalkLabel } from '../../services/geoEvents';
import { getSupabase } from '../../services/supabase';
import {
  fetchMapOccurrences,
  regionToBounds,
  timeWindowFor,
  toMapPinEvent,
  type MapPinEvent,
} from '../../services/mapEvents';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = BottomTabScreenProps<MainTabParamList, 'Map'>;

type UserLocation = {
  latitude: number;
  longitude: number;
};

type LoadStatus = 'loading' | 'ready' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

const UMASS_REGION: Region = {
  latitude:       42.3868,
  longitude:      -72.5280,
  latitudeDelta:  0.018,
  longitudeDelta: 0.018,
};

/** Wait this long after the map stops moving before querying. */
const REGION_QUERY_DELAY_MS = 400;

const CATEGORY_COLOR: Record<string, string> = {
  Dining:         '#C45C00',
  Sports:         '#2e61c7',
  Campus:         '#98190b',
  Nightlife:      '#5B2A8A',
  'Arts & Music': '#bd1479',
  All:            '#8B1A1A',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen({ route }: Props) {
  const mapRef = useRef<any>(null);

  const [userLocation, setUserLocation]   = useState<UserLocation | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [activeFilter, setActiveFilter]   = useState<TimeFilter>('This Week');
  const [searchQuery, setSearchQuery]     = useState('');

  const [region, setRegion]         = useState<Region>(UMASS_REGION);
  const [pins, setPins]             = useState<MapPinEvent[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey]   = useState(0);

  const nearbyEvents = useNearbyEvents(userLocation, pins);

  useEffect(() => {
    requestLocation();
  }, []);

    async function requestLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const result = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude:  result.coords.latitude,
        longitude: result.coords.longitude,
      });
    } catch (error) {
      // No location (simulator, indoors, services off): keep the map usable without it.
      console.warn('[Map] Could not get current location:', error);
    }
  }

  // Load pins for the visible area and time filter. The short delay avoids a
  // query on every frame while the user is still panning or zooming.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoadStatus('loading');
      try {
        const occurrences = await fetchMapOccurrences(
          (fn, args) => getSupabase().rpc(fn, args),
          regionToBounds(region),
          timeWindowFor(activeFilter),
        );
        if (cancelled) return;
        setPins(
          occurrences
            .filter(occurrence => occurrence.availability === 'available')
            .map(toMapPinEvent),
        );
        setLoadStatus('ready');
      } catch (error) {
        if (cancelled) return;
        console.warn('[Map] Failed to load events:', error);
        setLoadStatus('error');
      }
    }, REGION_QUERY_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [region, activeFilter, reloadKey]);

  // Highlight an event opened from another screen. Home passes the event ID,
  // so match it against each pin's eventId, not the occurrence ID.
  useEffect(() => {
    const highlightedId = route.params?.highlightedEventId;
    if (!highlightedId) return;
    const pin = pins.find(p => p.eventId === highlightedId);
    if (!pin || !pin.latitude || !pin.longitude) return;
    setSelectedEvent(pin);
    mapRef.current?.animateToRegion({
      latitude:       pin.latitude,
      longitude:      pin.longitude,
      latitudeDelta:  0.012,
      longitudeDelta: 0.012,
    }, 400);
  }, [route.params?.highlightedEventId, pins]);

  function handlePinPress(event: Event) {
    setSelectedEvent(event);
    if (!event.latitude || !event.longitude) return;
    mapRef.current?.animateToRegion(
      {
        latitude:       event.latitude,
        longitude:      event.longitude,
        latitudeDelta:  0.010,
        longitudeDelta: 0.010,
      },
      400,
    );
  }

  function handleMapPress() {
    setSelectedEvent(null);
  }

  function handleExpand(eventId: string) {
    // E06 — navigate to EventDetail using the pin's eventId
    console.log('Navigate to EventDetail:', eventId);
  }

  function getWalkLabelForEvent(event: Event): string {
    if (!userLocation) return '';
    return getWalkLabel(userLocation, event);
  }

  const query = searchQuery.trim().toLowerCase();
  const displayedEvents = pins.filter(e =>
    query.length === 0 ||
    e.title.toLowerCase().includes(query) ||
    e.location.toLowerCase().includes(query),
  );

  function renderStatus() {
    if (loadStatus === 'loading') {
      return (
        <View style={styles.statusPill}>
          <ActivityIndicator size="small" color={MAROON} />
          <Text style={styles.statusText}>Loading events…</Text>
        </View>
      );
    }
    if (loadStatus === 'error') {
      return (
        <Pressable style={styles.statusPill} onPress={() => setReloadKey(k => k + 1)}>
          <Text style={styles.statusText}>Couldn't load events. Tap to retry.</Text>
        </Pressable>
      );
    }
    if (displayedEvents.length === 0) {
      return (
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>
            {query ? 'No events match your search here.' : 'No events in this area yet.'}
          </Text>
        </View>
      );
    }
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.mapContainer}>

          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={UMASS_REGION}
            showsUserLocation={userLocation !== null}
            showsMyLocationButton={false}
            onPress={handleMapPress}
            onRegionChangeComplete={setRegion}
          >
            {displayedEvents.map(event => (
              event.latitude && event.longitude ? (
                <Marker
                  key={event.id}
                  coordinate={{ latitude: event.latitude, longitude: event.longitude }}
                  onPress={() => handlePinPress(event)}
                  tracksViewChanges={true}
                >
                  {/* Outer wrapper gives Android a fixed size to render into */}
                  <View style={styles.pinWrapper}>
                    <View style={[
                      styles.pin,
                      { backgroundColor: CATEGORY_COLOR[event.category] ?? MAROON },
                    ]}>
                      <Text style={styles.pinEmoji}>{event.emoji}</Text>
                    </View>
                  </View>
                </Marker>
              ) : null
            ))}
          </MapView>

          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search campus events..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
          </View>

          <View style={styles.filterBarWrapper}>
            <TimeFilterBar
              value={activeFilter}
              onChange={setActiveFilter}
            />
          </View>

          <View style={styles.statusWrapper} pointerEvents="box-none">
            {renderStatus()}
          </View>

        </View>

        {selectedEvent ? (
          <EventPreviewSheet
            event={selectedEvent}
            walkLabel={getWalkLabelForEvent(selectedEvent)}
            onClose={() => setSelectedEvent(null)}
            onExpand={handleExpand}
          />
        ) : (
          <NearbyScrollList
            events={nearbyEvents}
            userLocationAvailable={userLocation !== null}
            getWalkLabel={getWalkLabelForEvent}
            onCardPress={handlePinPress}
          />
        )}

      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const MAROON = '#8B1A1A';

const styles = StyleSheet.create({

  safe:      { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },

  mapContainer: {
    flex:     1,
    position: 'relative',
  },

  searchBar: {
    position:          'absolute',
    top:               12,
    left:              16,
    right:             16,
    zIndex:            10,
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#fff',
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   10,
    gap:               8,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.15,
    shadowRadius:      6,
    elevation:         6,
  },
  searchIcon:  { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1A1A' },

  filterBarWrapper: {
    position: 'absolute',
    top:      85,
    left:     0,
    right:    0,
    zIndex:   10,
  },

  statusWrapper: {
    position:   'absolute',
    top:        140,
    left:       0,
    right:      0,
    alignItems: 'center',
    zIndex:     10,
  },
  statusPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    backgroundColor:   '#fff',
    borderRadius:      16,
    paddingHorizontal: 14,
    paddingVertical:   8,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.12,
    shadowRadius:      4,
    elevation:         4,
  },
  statusText: { fontSize: 13, color: '#1A1A1A' },

  // Outer wrapper — gives Android a fixed bounding box to render the marker into
  // Without this Android renders before dimensions are calculated → falls back to default dot
  pinWrapper: {
    width:          64,
    height:         64,
    alignItems:     'center',
    justifyContent: 'center',
  },

  pin: {
    width:           46,
    height:          46,
    borderRadius:    23,
    backgroundColor: MAROON,
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       6,
  },
  pinSelected: {
    width:        54,
    height:       54,
    borderRadius: 27,
  },
  pinEmoji: { fontSize: 22 },

});