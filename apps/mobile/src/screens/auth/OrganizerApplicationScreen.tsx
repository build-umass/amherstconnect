import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';
import {
  EMPTY_ORGANIZER_APPLICATION,
  createOrganizerApplicationFixture,
  validateOrganizerApplication,
  type OrganizerApplicationDraft,
  type OrganizerApplicationField,
} from '../../services/organizerApplications';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'OrganizerApplication'>;
const ORGANIZATION_TYPES = ['Student organization', 'Nonprofit', 'Local business', 'University department', 'Other'];

export default function OrganizerApplicationScreen() {
  const navigation = useNavigation<Nav>();
  const [draft, setDraft] = useState<OrganizerApplicationDraft>({ ...EMPTY_ORGANIZER_APPLICATION });
  const [errors, setErrors] = useState<Partial<Record<OrganizerApplicationField, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends OrganizerApplicationField>(field: K, value: OrganizerApplicationDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }

  function submit() {
    const nextErrors = validateOrganizerApplication(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    const fixture = createOrganizerApplicationFixture(draft);
    navigation.navigate('OrganizerApplicationStatus', { status: fixture.status });
    setSubmitting(false);
  }

  function field(label: string, name: Exclude<OrganizerApplicationField, 'termsAccepted'>, placeholder: string, multiline = false, maxLength?: number, keyboardType?: 'default' | 'url') {
    const value = draft[name];
    return (
      <View style={styles.field} key={name}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          style={[styles.input, multiline && styles.multiline, errors[name] && styles.inputError]}
          value={value}
          onChangeText={text => update(name, text)}
          placeholder={placeholder}
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType === 'url' ? 'url' : 'default'}
          autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'url'}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
        {name === 'about' && <Text style={styles.counter}>{value.length}/500</Text>}
        {!!errors[name] && <Text style={styles.fieldError}>{errors[name]}</Text>}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Apply as an organizer</Text>
        <Text style={styles.intro}>Tell us about your organization. We’ll review your application before you can publish listings.</Text>

        <Text style={styles.label}>Organization type</Text>
        <View style={styles.options}>
          {ORGANIZATION_TYPES.map(option => {
            const selected = draft.organizationType === option;
            return (
              <TouchableOpacity
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => update('organizationType', option)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!errors.organizationType && <Text style={styles.fieldError}>{errors.organizationType}</Text>}

        {field('Organization name', 'organizationName', 'Name of your organization')}
        {field('Contact name', 'contactName', 'Your name')}
        {field('Your role', 'contactRole', 'For example, president or owner')}
        {field('Affiliation link', 'affiliationUrl', 'https://example.edu/organization', false, undefined, 'url')}
        <Text style={styles.helper}>Use a public HTTPS page that helps us verify your affiliation.</Text>
        {field('Amherst address (optional)', 'amherstAddress', 'Street address or Amherst location')}
        {field('About your organization', 'about', 'What should students know about you?', true, 500)}
        {field('What do you plan to post?', 'postingPlans', 'Events, deals, and how often you expect to post', true)}

        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: draft.termsAccepted }}
          style={styles.termsRow}
          onPress={() => update('termsAccepted', !draft.termsAccepted)}
        >
          <View style={[styles.checkbox, draft.termsAccepted && styles.checkboxSelected]}>
            {draft.termsAccepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.termsText}>I agree to the organizer terms and confirm this information is accurate.</Text>
        </TouchableOpacity>
        {!!errors.termsAccepted && <Text style={styles.fieldError}>{errors.termsAccepted}</Text>}

        <TouchableOpacity style={styles.primary} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit application</Text>}
        </TouchableOpacity>
        <Text style={styles.fixtureNote}>Applications are shown with sample review status until the organizer application service is connected.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36 },
  heading: { color: '#1a1a1a', fontSize: 25, fontWeight: '700', marginBottom: 8 },
  intro: { color: '#666', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  field: { marginTop: 18 },
  label: { color: '#282828', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  input: { borderColor: '#d8d8d8', borderRadius: 10, borderWidth: 1, color: '#222', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  inputError: { borderColor: '#a51c30' },
  multiline: { minHeight: 92 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderColor: '#d8d8d8', borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  optionSelected: { backgroundColor: '#fdf2f2', borderColor: '#881c1c' },
  optionText: { color: '#444', fontSize: 14 },
  optionTextSelected: { color: '#881c1c', fontWeight: '600' },
  helper: { color: '#777', fontSize: 13, marginTop: 6 },
  counter: { color: '#777', fontSize: 12, textAlign: 'right', marginTop: 4 },
  fieldError: { color: '#8a1f1f', fontSize: 13, marginTop: 5 },
  termsRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 22 },
  checkbox: { alignItems: 'center', borderColor: '#888', borderRadius: 4, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkboxSelected: { backgroundColor: '#881c1c', borderColor: '#881c1c' },
  checkmark: { color: '#fff', fontWeight: '700' },
  termsText: { color: '#444', flex: 1, fontSize: 14, lineHeight: 20 },
  primary: { alignItems: 'center', backgroundColor: '#881c1c', borderRadius: 10, marginTop: 24, minHeight: 50, justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fixtureNote: { color: '#777', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
