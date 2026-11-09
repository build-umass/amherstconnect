import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type {
  HomeStackParamList,
  MainTabParamList,
  MapHighlight,
  MapStackParamList,
} from '../../types/navigation';
import type { EventCategory } from '../../types/event';
import BookmarkButton from '../../components/BookmarkButton';
import { shareEvent } from '../../services/eventShare';
import { useEventDetails } from '../../hooks/useEventDetails';
import { categoryForSlug } from '../../services/mapEvents';
import { openDirections } from '../../utils/openDirections';
import {
  eventIdFromParams,
  occurrenceIdFromParams,
  newHighlightRequestId,
  canAttend,
  mapHighlightFor,
  primaryLink,
  resolveDetailScreen,
  statusBanner,
  type DetailViewEvent,
} from '../../services/eventDetailsView';

// Event Details is used in the Home and Map stacks (and Profile for saved events).
type Props = NativeStackScreenProps<HomeStackParamList, 'EventDetail'>;

/** "More dates" lists this many, then "+N more". */
const MORE_DATES_SHOWN = 5;

const CATEGORY_COLORS: Record<Exclude<EventCategory, 'All'>, { text: string; bg: string }> = {
  Dining:         { text: '#C45C00', bg: '#FFF0E0' },
  Sports:         { text: '#2e61c7', bg: '#FFF3E0' },
  Campus:         { text: '#98190b', bg: '#E8F5EE' },
  Nightlife:      { text: '#5B2A8A', bg: '#F3EDF9' },
  'Arts & Music': { text: '#bd1479', bg: '#F9EDF5' },
  'Talks & Lectures':    { text: '#2E61C7', bg: '#E8EEFA' },
  'Workshops & Classes': { text: '#0F7B6C', bg: '#E3F2EF' },
  'Arts & Culture':      { text: '#BD1479', bg: '#F9E6F0' },
  'Sports & Recreation': { text: '#2E8B3D', bg: '#E6F3E8' },
  'Career & Networking': { text: '#5B2A8A', bg: '#EFE8F5' },
  'Health & Wellness':   { text: '#0E8FA8', bg: '#E2F3F7' },
  'Social & Community':  { text: '#98190B', bg: '#F8E6E4' },
  'Food & Drink':        { text: '#C45C00', bg: '#FBEEE3' },
};

export default function EventDetailScreen({ route, navigation }: Props) {
  // E06: load the event by its canonical ID. A card passed from Home or the
  // map shows right away while the full event loads.
  const eventId = eventIdFromParams(route.params);
  const card = route.params?.event;
  const occurrenceId = occurrenceIdFromParams(route.params);
  const details = useEventDetails(eventId, undefined, occurrenceId);
  const screen = resolveDetailScreen({
    selectedOccurrenceId: occurrenceId,
    status: details.status,
    detail: details.event,
    card,
    error: details.error,
    look: categoryForSlug,
  });

  if (screen.kind !== 'show') {
    return (
      <EventDetailFallback
        kind={screen.kind}
        message={screen.kind === 'error' ? screen.message : null}
        onRetry={details.retry}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <EventDetailContent
      event={screen.event}
      eventId={eventId ?? screen.event.id}
      onBack={() => navigation.goBack()}
      onViewOnMap={target => openOnMap(navigation, target)}
      nextMapRequestId={newHighlightRequestId}
    />
  );
}

/**
 * "View on Map": inside the Map tab, go back to the map; from any other tab,
 * switch to the Map tab. Either way the map centers on the event.
 */
function openOnMap(navigation: Props['navigation'], target: MapHighlight) {
  if (navigation.getState().routeNames.includes('MapScreen' as never)) {
    (navigation as unknown as NativeStackNavigationProp<MapStackParamList, 'EventDetail'>)
      .popTo('MapScreen', target);
    return;
  }
  navigation
    .getParent<BottomTabNavigationProp<MainTabParamList>>()
    ?.navigate('Map', { screen: 'MapScreen', params: target });
}

function EventDetailFallback({
  kind,
  message,
  onRetry,
  onBack,
}: {
  kind: 'loading' | 'not-found' | 'error';
  message: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <SafeAreaView style={styles.fallback}>
      {kind === 'loading' ? (
        <ActivityIndicator size="large" color="#881c1c" />
      ) : (
        <>
          <Text style={styles.fallbackTitle}>
            {kind === 'not-found' ? 'Event not found' : "Couldn't load this event"}
          </Text>
          <Text style={styles.fallbackText}>
            {kind === 'not-found'
              ? 'It may have been removed or is no longer available.'
              : message}
          </Text>
          {kind === 'error' && (
            <TouchableOpacity style={styles.fallbackBtn} onPress={onRetry}>
              <Text style={styles.fallbackBtnText}>Try again</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      <TouchableOpacity style={styles.fallbackLink} onPress={onBack}>
        <Text style={styles.fallbackLinkText}>Go back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function EventDetailContent({
  event,
  eventId,
  onBack,
  onViewOnMap,
  nextMapRequestId,
}: {
  event: DetailViewEvent;
  /** Canonical route ID, used for the bookmark. */
  eventId: string;
  onBack: () => void;
  onViewOnMap: (target: MapHighlight) => void;
  nextMapRequestId: () => string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);
  // The full event can bring a different image than the card; give it a fresh try.
  useEffect(() => setImageFailed(false), [event.imageUrl]);
  const { top } = useSafeAreaInsets();

  const categoryStyle =
    event.category && event.category !== 'All'
      ? (CATEGORY_COLORS[event.category as Exclude<EventCategory, 'All'>] ?? { text: '#555', bg: '#F0F0F0' })
      : { text: '#555', bg: '#F0F0F0' };

  const categoryLabel =
    event.category && event.category !== 'All' ? event.category : 'Event';

  const banner = statusBanner(event);
  const link = primaryLink(event);
  const canShowOnMap = mapHighlightFor(event, 0) !== null;
  const hasFooter = link !== null || canShowOnMap;
  const directions = event.directionsQuery ?? null;
  const joinUrl = canAttend(event) ? (event.virtualUrl ?? null) : null;
  const showImage = Boolean(event.imageUrl) && !imageFailed;
  const moreDates = event.moreDates ?? [];

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2500);
  };

  // E02 only returns http(s) links, so these open in the browser.
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => showNotice("Couldn't open the link"));
  };

  const handleShare = async () => {
    const outcome = await shareEvent({ ...event, url: event.officialUrl }, {
      share: (payload) => Share.share(payload),
      copy: (text) => Clipboard.setStringAsync(text),
    });
    if (outcome === 'copied' || outcome === 'failed') {
      showNotice(outcome === 'copied' ? 'Event details copied' : "Couldn't share this event");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>

      {/* ── Hero: the event image, else the category emoji ── */}
      <View style={styles.hero}>
        {showImage && event.imageUrl ? (
          <>
            <Image
              source={{ uri: event.imageUrl }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
              accessibilityIgnoresInvertColors
            />
            {/* Keeps the white buttons readable on light photos. */}
            <View style={styles.heroScrim} />
          </>
        ) : (
          <View style={[styles.emojiWrapper, { backgroundColor: categoryStyle.bg }]}>
            <Text style={styles.heroEmoji}>{event.emoji ?? '📅'}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.heroBtn, styles.backBtn, { top: top + 12 }]}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.heroBtnText}>‹</Text>
        </TouchableOpacity>

        {/* Right icons: share + bookmark */}
        <View style={[styles.heroRight, { top: top + 12 }]}>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share event"
          >
            <Text style={styles.heroBtnText}>📤</Text>
          </TouchableOpacity>
          <View style={styles.heroBtn}>
            <BookmarkButton eventId={eventId} size={21} color="#fff" />
          </View>
        </View>

        {notice ? (
          <View style={[styles.notice, { top: top + 56 }]} accessibilityLiveRegion="polite">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {event.isFree && (
          <View style={[styles.badges, showImage && styles.badgesOnImage]}>
            <View style={styles.badgeFree}>
              <Text style={styles.badgeFreeText}>FREE</Text>
            </View>
          </View>
        )}
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

        {/* ── Cancelled / postponed ── */}
        {banner && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>{banner}</Text>
          </View>
        )}

        {/* ── Title ── */}
        <Text style={styles.title}>{event.title}</Text>

        {/* ── Organizer ── */}
        <Text style={styles.organizerLine}>
          {event.organizer ? (
            <>by <Text style={styles.organizerName}>{event.organizer}</Text></>
          ) : null}
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

        {/* ── More dates ── */}
        {moreDates.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>More dates</Text>
            {moreDates.slice(0, MORE_DATES_SHOWN).map(date => (
              <Text
                key={date.id}
                style={[styles.dateLine, date.status !== 'scheduled' && styles.dateLineOff]}
              >
                {date.label}
              </Text>
            ))}
            {moreDates.length > MORE_DATES_SHOWN && (
              <Text style={styles.moreDatesNote}>+{moreDates.length - MORE_DATES_SHOWN} more</Text>
            )}
          </View>
        )}

        {/* ── Getting There ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Getting There</Text>
          <Text style={styles.locationLine}>📍 {event.location}</Text>
          {event.address ? <Text style={styles.addressLine}>{event.address}</Text> : null}
          {directions || joinUrl ? (
            <View style={styles.linkRow}>
              {directions ? (
                <TouchableOpacity onPress={() => openDirections(directions)} accessibilityRole="link" hitSlop={8}>
                  <Text style={styles.inlineLink}>Get directions</Text>
                </TouchableOpacity>
              ) : null}
              {joinUrl ? (
                <TouchableOpacity onPress={() => openLink(joinUrl)} accessibilityRole="link" hitSlop={8}>
                  <Text style={styles.inlineLink}>Join online</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={{ height: hasFooter ? 100 : 24 }} />
      </ScrollView>

      {/* ── Footer: sign-up link and View on Map ── */}
      {hasFooter && (
        <View style={styles.footer}>
          {link && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => openLink(link.url)}
              activeOpacity={0.85}
              accessibilityRole="link"
              accessibilityHint="Opens in your browser"
            >
              <Text style={styles.linkBtnText}>{link.label}</Text>
            </TouchableOpacity>
          )}

          {/* Hidden for events with no location, and for cancelled/postponed ones. */}
          {canShowOnMap && (
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => {
                const target = mapHighlightFor(event, nextMapRequestId());
                if (target) onViewOnMap(target);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.mapBtnText}>View on Map</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F2F2F2',
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  fallbackText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  fallbackBtn: {
    backgroundColor: '#881c1c',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  fallbackBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  fallbackLink: {
    marginTop: 16,
  },
  fallbackLinkText: {
    color: '#881c1c',
    fontWeight: '600',
  },
  statusBanner: {
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  statusBannerText: {
    color: '#98190B',
    fontWeight: '700',
    fontSize: 14,
  },
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
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
  notice: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  noticeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  badgesOnImage: {
    position: 'absolute',
    left: 20,
    bottom: 16,
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
  addressLine: {
    fontSize: 13,
    color: '#777',
    lineHeight: 19,
    marginTop: 2,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  inlineLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B1A1A',
  },

  // More dates
  dateLine: {
    fontSize: 14,
    color: '#444',
    lineHeight: 24,
  },
  dateLineOff: {
    color: '#999',
  },
  moreDatesNote: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
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
  linkBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8B1A1A',
    backgroundColor: 'transparent',
  },
  linkBtnText: {
    color: '#8B1A1A',
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
