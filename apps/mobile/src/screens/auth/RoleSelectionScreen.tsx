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
  { value: 'student', label: 'Student', description: 'Currently enrolled at UMass Amherst' },
  { value: 'faculty_staff', label: 'Faculty / Staff', description: 'UMass Amherst faculty or staff member' },
  { value: 'alumni', label: 'Alumni', description: 'UMass Amherst graduate' },
  { value: 'local_resident', label: 'Local Resident', description: 'Amherst area community member' },
];

export default function RoleSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const { setOnboardingRole, user } = useAuth();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [entry, setEntry] = useState<'user' | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    setOnboardingRole(selected);
    // Already authenticated (e.g. app restart mid-onboarding) → skip SignUp
    // and finish onboarding (interests, while enabled). Otherwise this is part
    // of the email sign-up flow.
    if (!user) navigation.navigate('SignUp');
    else navigation.navigate(INTERESTS_ENABLED ? 'InterestSelection' : 'FinishOnboarding');
  };

  return (
    <View style={styles.container}>
      {!entry ? (
        <>
          <Text style={styles.heading}>How will you use Amherst Connect?</Text>
          <Text style={styles.subheading}>Choose how you’d like to get started.</Text>
          <TouchableOpacity style={styles.card} onPress={() => setEntry('user')} accessibilityRole="button">
            <Text style={styles.cardLabel}>I’m a user</Text>
            <Text style={styles.cardDesc}>Find events and opportunities around Amherst.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              // Organizer applications belong to an authenticated account. Use
              // the standard account setup first, then apply from Profile.
              setOnboardingRole('local_resident');
              if (!user) navigation.navigate('SignUp');
              else navigation.navigate(INTERESTS_ENABLED ? 'InterestSelection' : 'FinishOnboarding');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.cardLabel}>I’m an organizer</Text>
            <Text style={styles.cardDesc}>Create an account, then apply to share events and deals with the community.</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.backLink} onPress={() => { setEntry(null); setSelected(null); }} accessibilityRole="button">
            <Text style={styles.backText}>‹  Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>What best describes you?</Text>
          <Text style={styles.subheading}>This helps us personalize your experience</Text>

          <View style={styles.roles}>
            {ROLES.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[styles.card, selected === role.value && styles.cardSelected]}
                onPress={() => setSelected(role.value)}
              >
                <Text style={[styles.cardLabel, selected === role.value && styles.cardLabelSelected]}>
                  {role.label}
                </Text>
                <Text style={[styles.cardDesc, selected === role.value && styles.cardDescSelected]}>
                  {role.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.continueButton, !selected && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!selected}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    color: '#666',
    marginBottom: 32,
  },
  roles: {
    gap: 12,
  },
  backLink: { marginBottom: 20 },
  backText: { color: '#881c1c', fontSize: 15, fontWeight: '600' },
  card: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
  },
  cardSelected: {
    borderColor: '#881c1c',
    backgroundColor: '#fdf2f2',
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  cardLabelSelected: {
    color: '#881c1c',
  },
  cardDesc: {
    fontSize: 13,
    color: '#888',
  },
  cardDescSelected: {
    color: '#a94442',
  },
  continueButton: {
    backgroundColor: '#881c1c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
