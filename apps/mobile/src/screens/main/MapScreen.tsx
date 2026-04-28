import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../../types/navigation';
import type { Event } from '../../types/event';
import TimeFilterBar, { TimeFilter } from '../../components/map/TimeFilterBar';
import EventPreviewSheet from '../../components/map/EventPreviewSheet';
import NearbyScrollList from '../../components/map/NearbyScrollList';
import { useNearbyEvents, getWalkLabel } from '../../services/geoEvents';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = BottomTabScreenProps<MainTabParamList, 'Map'>;

type UserLocation = {
  latitude: number;
  longitude: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────



// 2. UMASS_REGION — zoom out to show all pins
const UMASS_REGION = {
  latitude:       42.3868,
  longitude:      -72.5280,
  latitudeDelta:  0.018,
  longitudeDelta: 0.018,
};

const CATEGORY_COLOR: Record<string, string> = {
  Dining:         '#ef4444',
  Sports:         '#22c55e',
  Campus:         '#3b82f6',
  Nightlife:      '#111111',
  'Arts & Music': '#ec4899',
  All:            '#8B1A1A',
};

// ── Dummy events — real UMass building coordinates ────────────────────────────
// Replace with useEvents() hook when Pranav ships it

const DUMMY_EVENTS: Event[] = [
  {
    id: '1',
    title: 'SASA Bollywood Night',
    category: 'Campus',
    date: 'Fri, Apr 25',
    time: '7:00 PM',
    location: 'Bowker Auditorium',
    emoji: '🎭',
    interested: 214,
    latitude: 42.3914,
    longitude: -72.5262,
  },
  {
    id: '2',
    title: 'Lunar New Year Festival',
    category: 'Dining',
    date: 'Sat, Apr 26',
    time: '4:30 PM',
    location: 'Worcester Dining Commons',
    emoji: '🍜',
    latitude: 42.3878,
    longitude: -72.5348,
  },
  {
    id: '3',
    title: 'UMass vs URI Basketball',
    category: 'Sports',
    date: 'Sun, Apr 27',
    time: '7:00 PM',
    location: 'Mullins Center',
    emoji: '🏀',
    interested: 1200,
    latitude: 42.3960,
    longitude: -72.5315,
  },
  {
    id: '4',
    title: 'Fine Arts Gala',
    category: 'Arts & Music',
    date: 'Sat, Apr 26',
    time: '5:00 PM',
    location: 'Fine Arts Center',
    emoji: '🎨',
    latitude: 42.3927,
    longitude: -72.5198,
  },
  {
    id: '5',
    title: 'Late Night Comedy Show',
    category: 'Nightlife',
    date: 'Fri, Apr 25',
    time: '9:30 PM',
    location: 'Amherst Coffee',
    emoji: '🎤',
    latitude: 42.3750,
    longitude: -72.5198,
  },
  {
    id: '6',
    title: 'Campus Farmers Market',
    category: 'Campus',
    date: 'Sat, Apr 26',
    time: '12:00 PM',
    location: 'Campus Center',
    emoji: '🌿',
    latitude: 42.3896,
    longitude: -72.5281,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen({ route }: Props) {
  const mapRef = useRef<any>(null);

  const [userLocation, setUserLocation]   = useState<UserLocation | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('This Week');
  const [searchQuery, setSearchQuery]     = useState('');

  const nearbyEvents = useNearbyEvents(userLocation, DUMMY_EVENTS);

  useEffect(() => {
    requestLocation();
  }, []);

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const result = await Location.getCurrentPositionAsync({});
    setUserLocation({
      latitude:  result.coords.latitude,
      longitude: result.coords.longitude,
    });
  }

  // Task 18 — uncomment after Pranav ships EventDetail
  // useEffect(() => {
  //   const highlightedId = route.params?.highlightedEventId;
  //   if (!highlightedId) return;
  //   const event = DUMMY_EVENTS.find(e => e.id === highlightedId);
  //   if (!event || !event.latitude || !event.longitude) return;
  //   setSelectedEvent(event);
  //   mapRef.current?.animateToRegion({
  //     latitude:       event.latitude,
  //     longitude:      event.longitude,
  //     latitudeDelta:  0.012,
  //     longitudeDelta: 0.012,
  //   }, 400);
  // }, [route.params?.highlightedEventId]);

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
    // Task 24 — uncomment when Pranav ships EventDetail
    // navigation.navigate('EventDetail', { eventId });
    console.log('Navigate to EventDetail:', eventId);
  }

  function getWalkLabelForEvent(event: Event): string {
    if (!userLocation) return '';
    return getWalkLabel(userLocation, event);
  }

  const displayedEvents = DUMMY_EVENTS.filter(e => {
    const matchesSearch =
      searchQuery.length === 0 ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === 'Now'        ? ['3'].includes(e.id) :
      activeFilter === 'Today'      ? ['1', '3', '5'].includes(e.id) :
      activeFilter === 'This Week'  ? true :
      true;

    return matchesSearch && matchesFilter;
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.mapContainer}>

          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={UMASS_REGION}
            showsUserLocation={userLocation !== null}
            showsMyLocationButton={false}
            onPress={handleMapPress}
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