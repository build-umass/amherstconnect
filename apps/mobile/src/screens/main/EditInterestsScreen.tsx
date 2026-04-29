import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { updateInterests } from '../../services/auth';

const MAROON = '#881c1c';

const INTERESTS = [
  'Dining', 'Music', 'Sports', 'Cultural', 'RSO',
  'Nightlife', 'Outdoors', 'Arts', 'Study Spots',
  'Shopping', 'Community', 'Fitness', 'Tech',
];

export default function EditInterestsScreen() {
  const navigation = useNavigation();
  const { appUser, refreshUser } = useAuth();
  const [selected, setSelected] = useState<string[]>(appUser?.interests ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (tag: string) => {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    if (!appUser) return;
    setSaving(true);
    try {
      await updateInterests(appUser.uid, selected);
      await refreshUser();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Edit Your Interests</Text>
      <Text style={styles.sub}>Tap to add or remove interests</Text>

      <View style={styles.tags}>
        {INTERESTS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[styles.tag, selected.includes(tag) && styles.tagSelected]}
            onPress={() => toggle(tag)}
          >
            <Text
              style={[
                styles.tagText,
                selected.includes(tag) && styles.tagTextSelected,
              ]}
            >
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primary, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Save</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 15, color: '#666', marginBottom: 24 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tagSelected: { backgroundColor: MAROON, borderColor: MAROON },
  tagText: { fontSize: 14, color: '#333' },
  tagTextSelected: { color: '#fff' },
  actions: { marginTop: 'auto', paddingBottom: 40, gap: 16 },
  primary: {
    backgroundColor: MAROON,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#999', fontSize: 15 },
});
