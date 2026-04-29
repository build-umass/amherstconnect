import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/firebase';
import { useSavedEvents } from '../../services/bookmarks';
import EventCard from '../../components/EventCard';
import type { Event } from '../../types/event';
import type { ProfileStackParamList } from '../../types/navigation';

const MAROON = '#881c1c';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;

const INTEREST_EMOJI: Record<string, string> = {
  Dining: '🍜',
  Music: '🎵',
  Sports: '🏀',
  Cultural: '🌍',
  RSO: '📣',
  Nightlife: '🌙',
  Outdoors: '🌲',
  Arts: '🎨',
  'Study Spots': '📖',
  Shopping: '🛍️',
  Community: '🤝',
  Fitness: '💪',
  Tech: '💻',
};

const ROLE_LABELS: Record<string, string> = {
  student: '🤙 UMass Student',
  faculty_staff: '🎓 Faculty / Staff',
  alumni: '🎓 UMass Alumni',
  local_resident: '📍 Local Resident',
};

type ProfileTab = 'saved' | 'rsvps';

export default function ProfileScreen() {
  const { appUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { savedEvents, loadingSaved } = useSavedEvents();

  const [activeTab, setActiveTab] = useState<ProfileTab>('saved');
  const [rsvpEvents, setRsvpEvents] = useState<Event[]>([]);
  const [loadingRsvps, setLoadingRsvps] = useState(true);

  const fetchRsvps = useCallback(async () => {
    if (!appUser) return;
    setLoadingRsvps(true);
    try {
      const q = query(
        collection(db, 'rsvps'),
        where('userId', '==', appUser.uid),
      );
      const snap = await getDocs(q);
      const eventIds = snap.docs.map((d) => d.data().eventId as string);

      if (eventIds.length === 0) {
        setRsvpEvents([]);
        return;
      }

      const eventsSnap = await getDocs(collection(db, 'events'));
      const events = eventsSnap.docs
        .filter((d) => eventIds.includes(d.id))
        .map((d) => ({ id: d.id, ...d.data() } as Event));
      setRsvpEvents(events);
    } catch {
      setRsvpEvents([]);
    } finally {
      setLoadingRsvps(false);
    }
  }, [appUser]);

  useEffect(() => {
    fetchRsvps();
  }, [fetchRsvps]);

  const initial = (appUser?.displayName ?? 'U').charAt(0).toUpperCase();
  const interests = appUser?.interests ?? [];

  const currentEvents = activeTab === 'saved' ? savedEvents : rsvpEvents;
  const currentLoading = activeTab === 'saved' ? loadingSaved : loadingRsvps;

  const handleEventPress = (event: Event) => {
    // Event Detail is owned by Pranav (task 14). For now we log a message.
    // Once EventDetail lands, replace with:
    //   navigation.navigate('EventDetail', { eventId: event.id });
    Alert.alert(event.title, `${event.date} · ${event.time}\n${event.location}`);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dark header + profile card ── */}
        <View style={[styles.headerSection, { paddingTop: insets.top + 12 }]}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>My Profile</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.gearIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {appUser?.photoURL ? (
              <Image source={{ uri: appUser.photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Text style={styles.cameraIcon}>📷</Text>
            </View>
          </View>

          {/* Name + role */}
          <Text style={styles.displayName}>{appUser?.displayName ?? 'User'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {ROLE_LABELS[appUser?.role ?? ''] ?? appUser?.role}
            </Text>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statEmoji}>📅</Text>
            <Text style={styles.statNumber}>{rsvpEvents.length}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statEmoji}>👥</Text>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statEmoji}>❤️</Text>
            <Text style={styles.statNumber}>{savedEvents.length}</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
        </View>

        {/* ── My Interests ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Interests</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditInterests')}
            >
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>

          {interests.length === 0 ? (
            <Text style={styles.emptyHint}>
              No interests selected yet. Tap Edit to add some!
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {interests.map((tag) => (
                <View key={tag} style={styles.chip}>
                  <Text style={styles.chipText}>
                    {INTEREST_EMOJI[tag] ?? '✨'} {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Saved Events / My RSVPs tabs ── */}
        <View style={styles.section}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
              onPress={() => setActiveTab('saved')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'saved' && styles.tabTextActive,
                ]}
              >
                Saved Events
                {savedEvents.length > 0 && (
                  <Text style={styles.tabBadge}> {savedEvents.length}</Text>
                )}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'rsvps' && styles.tabActive]}
              onPress={() => setActiveTab('rsvps')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'rsvps' && styles.tabTextActive,
                ]}
              >
                My RSVPs
              </Text>
            </TouchableOpacity>
          </View>

          {currentLoading ? (
            <ActivityIndicator
              color={MAROON}
              size="large"
              style={{ marginVertical: 40 }}
            />
          ) : currentEvents.length === 0 ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>
                {activeTab === 'saved'
                  ? 'No saved events yet. Browse events and bookmark the ones you like!'
                  : 'No RSVPs yet. RSVP to events you plan to attend!'}
              </Text>
            </View>
          ) : (
            currentEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onPress={() => handleEventPress(event)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  scroll: {
    flex: 1,
  },

  /* ── Header / profile card (dark maroon bg) ── */
  headerSection: {
    backgroundColor: MAROON,
    alignItems: 'center',
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  gearIcon: {
    fontSize: 22,
  },

  /* Avatar */
  avatarContainer: {
    marginBottom: 14,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8A838',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: MAROON,
  },
  cameraIcon: {
    fontSize: 14,
  },

  /* Name & role */
  displayName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  /* ── Stats row ── */
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -1,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    transform: [{ translateY: -14 }],
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 4,
  },

  /* ── Shared section ── */
  section: {
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  editLink: {
    fontSize: 14,
    fontWeight: '600',
    color: MAROON,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },

  /* ── Interest chips ── */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
  },

  /* ── Tab bar ── */
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    marginBottom: 14,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: MAROON,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#1A1A1A',
  },
  tabBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: MAROON,
  },

  /* ── Empty tab state ── */
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTabText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
  },
});
