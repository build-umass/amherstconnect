import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Lucide } from '@react-native-vector-icons/lucide';
import type { VenueOption } from '../../types/listing';
import { LISTING_COLORS as C, formStyles } from './formStyles';

interface Props {
  text: string;
  venueId: string | null;
  /** Null when suggestions should be hidden (empty, or a venue is picked). */
  query: string | null;
  searchVenues: (query: string) => Promise<VenueOption[]>;
  onChangeText: (text: string) => void;
  onPickVenue: (venue: VenueOption) => void;
  hasError?: boolean;
}

/** Free-text address with venue suggestions. Picking one sets venue_id. */
export default function VenueField({ text, venueId, query, searchVenues, onChangeText, onPickVenue, hasError }: Props) {
  const [suggestions, setSuggestions] = useState<VenueOption[]>([]);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      searchVenues(query)
        .then((venues) => current && setSuggestions(venues.slice(0, 5)))
        .catch(() => current && setSuggestions([]));
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, searchVenues]);

  return (
    <View>
      <View>
        <TextInput
          style={[formStyles.input, venueId ? styles.inputWithIcon : null, hasError && formStyles.inputError]}
          value={text}
          onChangeText={onChangeText}
          placeholder="Venue name or street address"
          placeholderTextColor={C.muted}
          autoCorrect={false}
          accessibilityLabel="Venue or address"
        />
        {venueId ? (
          <View style={styles.pickedIcon} accessibilityLabel="Venue selected">
            <Lucide name="map-pin" size={16} color={C.maroon} />
          </View>
        ) : null}
      </View>
      {suggestions.length > 0 ? (
        <View style={styles.list} accessibilityRole="menu">
          {suggestions.map((v) => (
            <Pressable
              key={v.id}
              style={styles.item}
              onPress={() => onPickVenue(v)}
              accessibilityRole="menuitem"
            >
              <Lucide name="map-pin" size={14} color={C.muted} />
              <View style={styles.itemText}>
                <Text style={styles.name}>{v.name}</Text>
                {v.addressLine1 ? <Text style={styles.address}>{v.addressLine1}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWithIcon: { paddingRight: 36 },
  pickedIcon: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  list: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  itemText: { flex: 1 },
  name: { fontSize: 14, color: C.text },
  address: { fontSize: 12, color: C.muted },
});
