import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Event } from '../../types/event';
import { openDirections } from '../../utils/openDirections';

export interface EventPreviewSheetProps {
  event: Event;
  walkLabel: string;
  onClose: () => void;
  onExpand: (eventId: string) => void;
}

export default function EventPreviewSheet({
  event,
  walkLabel,
  onClose,
  onExpand,
}: EventPreviewSheetProps) {
  return (
    <View style={styles.card}>
      <View style={styles.handle} />

      <View style={styles.topRow}>
        <Text style={styles.category}>{event.category}</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{event.title}</Text>

      <Text style={styles.meta}>
        🕐 {event.time}{'   '}
        📍 {event.location}
        {walkLabel ? `   🚶 ${walkLabel}` : ''}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => openDirections(event.location)}
        >
          <Text style={styles.outlineBtnText}>Get Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.solidBtn}
          onPress={() => onExpand(event.id)}
        >
          <Text style={styles.solidBtnText}>View Event →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const MAROON = '#8B1A1A';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e5e5',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  category: {
    fontSize: 11,
    fontWeight: '700',
    color: MAROON,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  closeBtn:  { fontSize: 18, color: '#aaa' },
  title:     { fontSize: 19, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  meta:      { fontSize: 12, color: '#555', marginBottom: 16, lineHeight: 18 },
  actions:   { flexDirection: 'row', gap: 12 },
  outlineBtn:     { flex: 1, borderWidth: 1.5, borderColor: MAROON, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  outlineBtnText: { color: MAROON, fontWeight: '700', fontSize: 14 },
  solidBtn:       { flex: 1, backgroundColor: MAROON, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  solidBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
});