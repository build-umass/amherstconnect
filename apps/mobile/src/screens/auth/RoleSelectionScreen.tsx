import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import type { UserRole } from '../../types/auth';
import { useAuth } from '../../contexts/AuthContext';
import { INTERESTS_ENABLED } from '../../constants/features';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RoleSelection'>;

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'user', label: 'User', description: 'Find events and opportunities around Amherst.' },
  { value: 'organizer', label: 'Organizer', description: 'Create an account and apply to share events and deals.' },
];

export default function RoleSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const { setOnboardingRole, user } = useAuth();
  const [selected, setSelected] = useState<UserRole | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    setOnboardingRole(selected);
    if (!user) navigation.navigate('SignUp');
    else navigation.navigate(INTERESTS_ENABLED ? 'InterestSelection' : 'FinishOnboarding');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose your account type</Text>
      <Text style={styles.subheading}>You can apply to become an organizer now or later from your Profile.</Text>
      <View style={styles.roles}>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.value}
            style={[styles.card, selected === role.value && styles.cardSelected]}
            onPress={() => setSelected(role.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === role.value }}
          >
            <Text style={[styles.cardLabel, selected === role.value && styles.cardLabelSelected]}>{role.label}</Text>
            <Text style={[styles.cardDesc, selected === role.value && styles.cardDescSelected]}>{role.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.continueButton, !selected && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!selected}
      >
        <Text style={styles.continueButtonText}>Continue to sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  heading: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  subheading: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 28 },
  roles: { gap: 12 },
  card: { borderWidth: 2, borderColor: '#e0e0e0', borderRadius: 12, padding: 16 },
  cardSelected: { borderColor: '#881c1c', backgroundColor: '#fdf2f2' },
  cardLabel: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  cardLabelSelected: { color: '#881c1c' },
  cardDesc: { fontSize: 14, color: '#666', lineHeight: 20 },
  cardDescSelected: { color: '#4c1717' },
  continueButton: { backgroundColor: '#881c1c', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  continueButtonDisabled: { opacity: 0.45 },
  continueButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
