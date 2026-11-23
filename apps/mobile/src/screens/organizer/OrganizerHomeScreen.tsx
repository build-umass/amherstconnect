import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OrganizerStackParamList } from '../../types/navigation';
import { LISTING_ERROR_CODES, type ListingErrorCode } from '../../types/listing';
import { FIXTURE_ORGANIZER_ID } from '../../services/listingRepository';
import { getListingRepository } from '../../services/listings';
import { LISTING_COLORS as C } from '../../components/listing/formStyles';

type Nav = NativeStackNavigationProp<OrganizerStackParamList, 'OrganizerHome'>;

/**
 * TEMPORARY (Task 4.1). Task 3.1 replaces this with the organizer status
 * dashboard and approval gate, then opens NewListing with the real organizer id.
 */
export default function OrganizerHomeScreen() {
  const navigation = useNavigation<Nav>();
  const repo = getListingRepository();
  const [simulated, setSimulated] = useState<ListingErrorCode | null>(repo.simulatedError);

  const choose = (code: ListingErrorCode | null) => {
    repo.simulateError(code);
    setSimulated(code);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        Organizer
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preview with test data</Text>
        <Text style={styles.body}>
          The listing form is not connected yet. Posts are kept in memory only and reset when the app restarts.
        </Text>
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate('NewListing', { organizerId: FIXTURE_ORGANIZER_ID })}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>New listing</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Simulate a server error on Post</Text>
        <View style={styles.chips}>
          {[null, ...LISTING_ERROR_CODES].map((code) => {
            const selected = simulated === code;
            return (
              <Pressable
                key={code ?? 'none'}
                onPress={() => choose(code)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{code ?? 'none'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  card: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  body: { fontSize: 14, color: C.muted, lineHeight: 20 },
  primary: { backgroundColor: C.maroon, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipSelected: { backgroundColor: C.maroonTint, borderColor: C.maroon },
  chipText: { fontSize: 13, color: C.text },
  chipTextSelected: { color: C.maroon, fontWeight: '600' },
});
