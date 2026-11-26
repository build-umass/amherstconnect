// Manual integration against an isolated, disposable local Supabase stack.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';
import { createManagementRepository } from '../src/managementRepository.js';
const c = localConnection();
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(c.API_URL).hostname), 'Local Supabase required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(c.API_URL, c.SECRET_KEY ?? c.SERVICE_ROLE_KEY, options);
const sessions = [];
async function user(kind) {
  const email = 'management-' + kind + '-' + randomUUID() + '@example.test';
  const password = randomUUID() + 'Aa1!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const id = created.data.user.id;
  assert.ifError((await admin.from('profiles').insert({ id, display_name: 'Local management fixture', role: 'student' })).error);
  const client = createClient(c.API_URL, c.PUBLISHABLE_KEY ?? c.ANON_KEY, options);
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  sessions.push(client);
  return { id, client };
}
try {
  const reviewer = await user('reviewer');
  const applicant = await user('applicant');
  const student = await user('student');
  assert.ifError((await admin.from('content_reviewer_memberships').insert({ profile_id: reviewer.id })).error);
  const application = await applicant.client.rpc('submit_organizer_application', {
    p_organizer_name: 'Local management example', p_organizer_kind: 'informal_group', p_contact_name: 'Fixture',
    p_contact_role: 'Host', p_affiliation_url: 'https://example.test', p_amherst_street_address: null,
    p_about: 'Local management verification.', p_plans_events: true, p_plans_deals: false,
    p_estimated_posting_frequency: 'weekly', p_accept_terms: true,
  });
  assert.ifError(application.error);
  const decision = await reviewer.client.rpc('approve_organizer_application', { p_application_id: application.data[0].id });
  assert.ifError(decision.error);
  const organizerId = decision.data[0].organizer_id;
  const repository = createManagementRepository(reviewer.client, { getSessionUserId: () => reviewer.id });
  const organizers = await repository.organizers();
  const organizer = organizers.find(row => row.id === organizerId);
  assert.ok(organizer);
  assert.equal(organizer.organizer_publishing_settings.weekly_cap, 3);
  assert.ok((await repository.contact(organizerId)).contact_email);
  const category = await admin.from('categories').select('id').limit(1).single();
  assert.ifError(category.error);
  const inserted = await admin.from('events').insert({
    title: 'Local reviewer moderation fixture', primary_category_id: category.data.id,
    organizer_id: organizerId, source_type: 'amherst_connect', status: 'published',
  }).select('id').single();
  assert.ifError(inserted.error);
  const eventId = inserted.data.id;
  const displayed = (await repository.events()).find(row => row.id === eventId);
  assert.ok(displayed);
  assert.equal(displayed.organizers.name, 'Local management example');
  const before = await student.client.from('events').select('id').eq('id', eventId);
  assert.ifError(before.error); assert.equal(before.data.length, 1);
  const forbidden = await student.client.rpc('remove_organizer_event', { p_event_id: eventId });
  assert.equal(forbidden.error?.code, '42501');
  for (const table of ['audit_log', 'organization_contacts']) {
    const result = await student.client.from(table).select('*');
    assert.ifError(result.error); assert.equal(result.data.length, 0);
  }
  await repository.removeEvent(eventId);
  assert.ok(!(await repository.events()).some(row => row.id === eventId));
  const after = await student.client.from('events').select('id').eq('id', eventId);
  assert.ifError(after.error); assert.equal(after.data.length, 0);
  assert.ok((await repository.audit(organizerId)).some(row => row.action === 'event_update' && row.event_id === eventId && row.actor_profile_id === reviewer.id));
  const membership = await applicant.client.rpc('can_manage_organizer', { p_organizer_id: organizerId });
  assert.ifError(membership.error); assert.equal(membership.data, true);
  assert.equal((await repository.organizers()).find(row => row.id === organizerId).organizer_publishing_settings.weekly_cap, 3);
  const imported = await admin.from('events').select('id').eq('source_type', 'localist').limit(1).single();
  assert.ifError(imported.error);
  const protectedEvent = await reviewer.client.rpc('remove_organizer_event', { p_event_id: imported.data.id });
  assert.equal(protectedEvent.error?.code, 'P0002');
  console.log('PASS: real organizer/cap/contact reads, reviewer removal, student visibility, audit actor, unchanged membership/cap, nonreviewer denial and Localist protection.');
} finally {
  for (const session of sessions) await session.auth.signOut({ scope: 'local' });
}
