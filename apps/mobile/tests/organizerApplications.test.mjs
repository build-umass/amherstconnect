import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ORGANIZER_APPLICATION, ORGANIZER_KINDS, ORGANIZER_STATUS_FIXTURES,
  validateOrganizerApplication, applicationRpcParameters } from '../src/services/organizerApplications.ts';
const valid = () => ({ ...EMPTY_ORGANIZER_APPLICATION, organizationName: 'Community group',
  organizationType: 'informal_group', contactName: 'Fixture Person', contactRole: 'Coordinator',
  affiliationUrl: 'https://example.test/group', about: 'Open community activities.',
  plansEvents: true, estimatedPostingFrequency: 'monthly', termsAccepted: true });
test('complete form produces the exact applicant RPC parameters without email or identity', () => {
  const draft = valid();
  assert.deepEqual(validateOrganizerApplication(draft), {});
  assert.deepEqual(applicationRpcParameters(draft), {
    p_organizer_name: 'Community group', p_organizer_kind: 'informal_group',
    p_contact_name: 'Fixture Person', p_contact_role: 'Coordinator',
    p_affiliation_url: 'https://example.test/group', p_amherst_street_address: null,
    p_about: 'Open community activities.', p_plans_events: true, p_plans_deals: false,
    p_estimated_posting_frequency: 'monthly', p_accept_terms: true,
  });
});
test('backend required fields, enum values and plan choices are enforced before submission', () => {
  for (const patch of [{ about: ' ' }, { plansEvents: false }, { organizationType: 'Unknown' },
    { estimatedPostingFrequency: 'sometimes' }, { termsAccepted: false },
    { affiliationUrl: 'http://example.test' }, { affiliationUrl: 'https://localhost' },
    { affiliationUrl: 'https://example.test/' + 'x'.repeat(2048) }, { about: 'Bad\u0001text' }, { contactName: 'x'.repeat(121) }]) {
    const draft = { ...valid(), ...patch };
    assert.ok(Object.keys(validateOrganizerApplication(draft)).length);
    assert.throws(() => applicationRpcParameters(draft));
  }
  assert.deepEqual(validateOrganizerApplication({ ...valid(), plansEvents: false, plansDeals: true }), {});
});
test('all agreed organizer types and withdrawn status are represented', () => {
  assert.equal(ORGANIZER_KINDS.length, 7);
  for (const option of ORGANIZER_KINDS)
    assert.deepEqual(validateOrganizerApplication({ ...valid(), organizationType: option.value }), {});
  assert.equal(ORGANIZER_STATUS_FIXTURES.withdrawn.label, 'Withdrawn');
});
