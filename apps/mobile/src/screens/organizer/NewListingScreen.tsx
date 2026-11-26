import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Lucide } from '@react-native-vector-icons/lucide';
import type { OrganizerStackParamList } from '../../types/navigation';
import type { CategoryOption, ListingType, PublishResult, PublishingContext } from '../../types/listing';
import {
  DESCRIPTION_MAX,
  LISTING_TIME_ZONE,
  TITLE_MAX,
  charCount,
  emptyDraft,
  fieldErrorsFromServer,
  pickVenue,
  prepareListing,
  publishErrorMessage,
  remainingText,
  setLocationText,
  switchListingType,
  todayIn,
  toggleCategory,
  validateListing,
  venueQuery,
  type FieldErrors,
  type ListingDraft,
} from '../../services/listingForm';
import { getListingRepository, newRequestKey } from '../../services/listings';
import FormField from '../../components/listing/FormField';
import SegmentedControl from '../../components/listing/SegmentedControl';
import CategoryPicker from '../../components/listing/CategoryPicker';
import VenueField from '../../components/listing/VenueField';
import DateTimeField from '../../components/listing/DateTimeField';
import { LISTING_COLORS as C, formStyles } from '../../components/listing/formStyles';

type Route = RouteProp<OrganizerStackParamList, 'NewListing'>;
type Banner = { kind: 'error' | 'success'; text: string };

const TYPE_OPTIONS = [
  { value: 'event', label: 'Event' },
  { value: 'deal', label: 'Deal' },
] as const;

const CHECK_FIELDS = 'Some fields need changes. Check the highlighted fields.';

export default function NewListingScreen() {
  const { organizerId } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();
  const repo = getListingRepository();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const requestKey = useRef(newRequestKey());

  const [context, setContext] = useState<PublishingContext | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<ListingDraft>(() => emptyDraft('event'));
  // Errors show after the first Post attempt, then update as fields change.
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    Promise.all([repo.getPublishingContext(organizerId), repo.listCategories()])
      .then(([ctx, cats]) => {
        setContext(ctx);
        setCategories(cats);
      })
      .catch(() => setLoadFailed(true));
  }, [repo, organizerId]);

  useEffect(load, [load]);

  const update = (change: (d: ListingDraft) => ListingDraft) => {
    setDraft(change);
    setServerErrors({});
  };
  const set = <K extends keyof ListingDraft>(key: K) => (value: ListingDraft[K]) =>
    update((d) => ({ ...d, [key]: value }));

  const errors: FieldErrors = { ...serverErrors, ...(attempted ? validateListing(draft, new Date()) : {}) };
  const today = todayIn(LISTING_TIME_ZONE, new Date());
  const isEvent = draft.type === 'event';
  const outOfListings = context !== null && context.remainingThisWeek <= 0;

  const showBanner = (b: Banner) => {
    setBanner(b);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const submit = async () => {
    if (submitting || !context) return;
    setAttempted(true);
    const prepared = prepareListing(draft, { organizerId, requestKey: requestKey.current }, new Date());
    if (!prepared.ok) {
      showBanner({ kind: 'error', text: CHECK_FIELDS });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    let result: PublishResult;
    try {
      const { submission } = prepared;
      result =
        submission.type === 'event'
          ? await repo.publishEvent(submission.input)
          : await repo.publishDeal(submission.input);
    } catch {
      result = { ok: false, code: 'network', message: 'Request failed' };
    }
    setSubmitting(false);

    if (result.ok) {
      const remaining = result.remainingThisWeek;
      setContext((c) => (c ? { ...c, remainingThisWeek: remaining } : c));
      setDraft(emptyDraft(draft.type));
      setAttempted(false);
      setServerErrors({});
      requestKey.current = newRequestKey();
      showBanner({ kind: 'success', text: `Your ${draft.type} is live.` });
      return;
    }
    // Same request key on retry, so a slow first attempt can't post twice.
    setServerErrors(fieldErrorsFromServer(result.fieldErrors));
    showBanner({ kind: 'error', text: publishErrorMessage(result.code, context) });
  };

  if (!context) {
    return (
      <View style={[styles.root, styles.center]}>
        {loadFailed ? (
          <>
            <Text style={styles.loadError}>Couldn't load the listing form.</Text>
            <Pressable style={styles.retry} onPress={load} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={C.maroon} />
        )}
      </View>
    );
  }

  const counter = (text: string, max: number) => `${charCount(text.trim())} / ${max.toLocaleString('en-US')}`;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          New listing
        </Text>
        <Text style={styles.subtitle}>
          Posting as {context.organizerName}. Your listing goes live at once.{' '}
          <Text style={styles.bold}>{remainingText(context)}</Text>
        </Text>

        {banner ? (
          <View
            style={[styles.banner, banner.kind === 'error' ? styles.bannerError : styles.bannerSuccess]}
            accessibilityRole="alert"
          >
            <Lucide
              name={banner.kind === 'error' ? 'circle-alert' : 'check'}
              size={18}
              color={banner.kind === 'error' ? C.error : C.success}
            />
            <Text style={[styles.bannerText, { color: banner.kind === 'error' ? C.error : C.success }]}>
              {banner.text}
            </Text>
          </View>
        ) : null}

        <FormField label="Listing type">
          <SegmentedControl<ListingType>
            options={TYPE_OPTIONS}
            value={draft.type}
            onChange={(type) => update((d) => switchListingType(d, type))}
          />
        </FormField>

        <FormField
          label="Title"
          helper="1 to 120 characters, plain text."
          error={errors.title}
          counter={counter(draft.title, TITLE_MAX)}
          counterOver={charCount(draft.title.trim()) > TITLE_MAX}
        >
          <TextInput
            style={[formStyles.input, errors.title && formStyles.inputError]}
            value={draft.title}
            onChangeText={set('title')}
            placeholder={isEvent ? 'Author reading and book signing' : '10% off all paperbacks'}
            placeholderTextColor={C.muted}
            accessibilityLabel="Title"
          />
        </FormField>

        <FormField
          label="Description"
          helper="Up to 1,000 characters, plain text."
          error={errors.description}
          counter={counter(draft.description, DESCRIPTION_MAX)}
          counterOver={charCount(draft.description.trim()) > DESCRIPTION_MAX}
        >
          <TextInput
            style={[formStyles.input, formStyles.inputMultiline, errors.description && formStyles.inputError]}
            value={draft.description}
            onChangeText={set('description')}
            multiline
            accessibilityLabel="Description"
          />
        </FormField>

        {isEvent ? (
          <>
            <FormField label="Starts" helper="New York time." error={errors.startsAt}>
              <DateTimeField
                label="Starts"
                date={draft.startDate}
                time={draft.startTime}
                onChangeDate={set('startDate')}
                onChangeTime={set('startTime')}
                minDate={today}
                hasError={Boolean(errors.startsAt)}
              />
            </FormField>
            <FormField label="Ends (optional)" error={errors.endsAt}>
              <DateTimeField
                label="Ends"
                date={draft.endDate}
                time={draft.endTime}
                onChangeDate={set('endDate')}
                onChangeTime={set('endTime')}
                minDate={draft.startDate ?? today}
                clearable
                hasError={Boolean(errors.endsAt)}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Valid from" helper="Time is optional; the deal starts at 12:00 AM." error={errors.validFrom}>
              <DateTimeField
                label="Valid from"
                date={draft.validFromDate}
                time={draft.validFromTime}
                onChangeDate={set('validFromDate')}
                onChangeTime={set('validFromTime')}
                minDate={today}
                timePlaceholder="Time (optional)"
                hasError={Boolean(errors.validFrom)}
              />
            </FormField>
            <FormField
              label="Valid until"
              helper="Time is optional; the deal ends at 11:59 PM."
              error={errors.validUntil}
            >
              <DateTimeField
                label="Valid until"
                date={draft.validUntilDate}
                time={draft.validUntilTime}
                onChangeDate={set('validUntilDate')}
                onChangeTime={set('validUntilTime')}
                minDate={draft.validFromDate ?? today}
                timePlaceholder="Time (optional)"
                hasError={Boolean(errors.validUntil)}
              />
            </FormField>
          </>
        )}

        <FormField label="Venue or address" helper="Shown in details." error={errors.location}>
          <VenueField
            text={draft.locationText}
            venueId={draft.venueId}
            query={venueQuery(draft)}
            searchVenues={repo.searchVenues}
            onChangeText={(text) => update((d) => setLocationText(d, text))}
            onPickVenue={(venue) => update((d) => pickVenue(d, venue))}
            hasError={Boolean(errors.location)}
          />
        </FormField>

        <FormField
          label={isEvent ? 'Categories' : 'Category'}
          helper={isEvent ? 'Choose one or more.' : undefined}
          error={errors.categoryIds}
        >
          <CategoryPicker
            categories={categories}
            selectedIds={draft.categoryIds}
            multiple={isEvent}
            onToggle={(id) => update((d) => toggleCategory(d, id))}
            hasError={Boolean(errors.categoryIds)}
          />
        </FormField>

        <FormField label="Official link (optional)" helper="https only." error={errors.listingUrl}>
          <TextInput
            style={[formStyles.input, errors.listingUrl && formStyles.inputError]}
            value={draft.listingUrl}
            onChangeText={set('listingUrl')}
            placeholder="https://example.com"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Official link"
          />
        </FormField>

        {!isEvent ? (
          <>
            <FormField label="Terms" helper="What the customer receives, and any limits." error={errors.terms}>
              <TextInput
                style={[formStyles.input, formStyles.inputMultiline, errors.terms && formStyles.inputError]}
                value={draft.terms}
                onChangeText={set('terms')}
                multiline
                accessibilityLabel="Terms"
              />
            </FormField>
            <FormField
              label="Eligibility note (optional)"
              helper="Shown on the deal. The app does not check it."
              error={errors.eligibilityNote}
            >
              <TextInput
                style={[formStyles.input, errors.eligibilityNote && formStyles.inputError]}
                value={draft.eligibilityNote}
                onChangeText={set('eligibilityNote')}
                placeholder="Students with a valid ID"
                placeholderTextColor={C.muted}
                accessibilityLabel="Eligibility note"
              />
            </FormField>
          </>
        ) : null}

        <Pressable
          style={[styles.post, (submitting || outOfListings) && styles.postDisabled]}
          onPress={submit}
          disabled={submitting || outOfListings}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || outOfListings, busy: submitting }}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postText}>Post listing</Text>}
        </Pressable>
        {outOfListings ? (
          <Text style={styles.postNote}>
            {context.weeklyCap === 0
              ? 'Posting is paused for your organization.'
              : "You've used all your listings for this week."}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, marginBottom: 16, lineHeight: 20 },
  bold: { fontWeight: '700', color: C.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  bannerError: { backgroundColor: C.errorTint },
  bannerSuccess: { backgroundColor: C.successTint },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
  post: {
    backgroundColor: C.maroon,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  postDisabled: { opacity: 0.5 },
  postText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  postNote: { marginTop: 8, fontSize: 13, color: C.muted, textAlign: 'center' },
  loadError: { fontSize: 15, color: C.text, marginBottom: 12 },
  retry: { borderWidth: 1, borderColor: C.maroon, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { color: C.maroon, fontWeight: '600' },
});
