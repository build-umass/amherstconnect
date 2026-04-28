import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { createUserDocument, checkUserExists, completeOnboarding } from '../../services/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 24;
const GAP = 12;
const CHIP_W = (SCREEN_W - H_PAD * 2 - GAP) / 2;

const INTERESTS = [
  { emoji: '🍽️', label: 'Dining' },
  { emoji: '🏆', label: 'Sports' },
  { emoji: '🎵', label: 'Music' },
  { emoji: '🎨', label: 'Arts' },
  { emoji: '🌍', label: 'Cultural' },
  { emoji: '🎓', label: 'Academic' },
  { emoji: '👥', label: 'RSO Events' },
  { emoji: '💪', label: 'Fitness' },
  { emoji: '📋', label: 'Study Groups' },
  { emoji: '🎭', label: 'Theater' },
  { emoji: '⚡', label: 'Nightlife' },
  { emoji: '☕', label: 'Coffee' },
];

// Chunk array into rows of 2 for the grid
const rows = INTERESTS.reduce<(typeof INTERESTS)[]>((acc, item, i) => {
  if (i % 2 === 0) acc.push([item]);
  else acc[acc.length - 1].push(item);
  return acc;
}, []);

export default function InterestSelectionScreen() {
  const { firebaseUser, onboardingData, refreshUser } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = (label: string) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
  };

  const finish = async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const exists = await checkUserExists(firebaseUser.uid);
      if (!exists) {
        const providerId = firebaseUser.providerData[0]?.providerId;
        const authProvider = providerId === 'google.com' ? 'google' : 'email';
        await createUserDocument(
          firebaseUser.uid,
          firebaseUser.email ?? '',
          firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User',
          firebaseUser.photoURL,
          onboardingData?.role ?? 'student',
          selected,
          authProvider,
          true,
        );
      } else {
        await completeOnboarding(firebaseUser.uid, selected);
      }
      await refreshUser();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepLabel}>STEP 3 OF 3 — PERSONALIZE</Text>
        <Text style={styles.heading}>What are you into?</Text>
        <Text style={styles.sub}>
          Pick topics to personalize your feed.{' '}
          <Text style={styles.count}>{selected.length} selected</Text>
        </Text>

        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((item) => {
                const isSelected = selected.includes(item.label);
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => toggle(item.label)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.chipEmoji}>{item.emoji}</Text>
                    <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={finish} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Let's Go →</Text>}
        </TouchableOpacity>
        <Text style={styles.footnote}>You can change these anytime in Settings.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2EDE8',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 64,
    paddingBottom: 16,
  },

  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#881c1c',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sub: {
    fontSize: 15,
    color: '#555',
    marginBottom: 28,
  },
  count: {
    color: '#881c1c',
    fontWeight: '700',
  },

  grid: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  chip: {
    width: CHIP_W,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipSelected: {
    backgroundColor: '#881c1c',
  },
  chipEmoji: {
    fontSize: 20,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    flexShrink: 1,
  },
  chipLabelSelected: {
    color: '#fff',
  },

  footer: {
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: '#F2EDE8',
    gap: 12,
  },
  btn: {
    backgroundColor: '#881c1c',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  footnote: {
    textAlign: 'center',
    fontSize: 13,
    color: '#888',
  },
});
