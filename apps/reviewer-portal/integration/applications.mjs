// Run manually against an isolated local Supabase stack after migrations.
// Creates local fixture accounts only. Never use against a hosted URL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localConnection } from '../../../scripts/importer/local-connection.mjs';
import { createSupabaseApplicationRepository } from '../src/applicationRepository.js';

const c = localConnection();
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(c.API_URL).hostname), 'Local Supabase required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(c.API_URL, c.SECRET_KEY ?? c.SERVICE_ROLE_KEY, options);
const clients = [];
try {
  const users = {};
  for (const kind of ['reviewer', 'applicant', 'ordinary']) {
    const email = 'portal-' + kind + '-' + randomUUID() + '@example.test';
    const password = randomUUID() + 'Aa1!';
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(result.error);
    users[kind] = result.data.user.id;
    const profile = await admin.from('profiles').insert({ id: result.data.user.id, role: 'student', display_name: 'Local portal fixture' });
    assert.ifError(profile.error);
    const client = createClient(c.API_URL, c.PUBLISHABLE_KEY ?? c.ANON_KEY, options);
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    users[kind + 'Client'] = client;
    clients.push(client);
  }
  assert.ifError((await admin.from('content_reviewer_memberships').insert({ profile_id: users.reviewer })).error);
  const applicant = users.applicantClient;
  async function submit(name) {
    const result = await applicant.rpc('submit_organizer_application', {
      p_organizer_name: name, p_organizer_kind: 'informal_group',
      p_contact_name: 'Local Fixture', p_contact_role: 'Host', p_affiliation_url: 'https://example.test',
      p_amherst_street_address: null, p_about: 'Local integration fixture',
      p_plans_events: true, p_plans_deals: true, p_estimated_posting_frequency: 'weekly', p_accept_terms: true,
    });
    assert.ifError(result.error);
    return result.data[0].id;
  }
  const repo = createSupabaseApplicationRepository(users.reviewerClient, { getSessionUserId: () => users.reviewer });
  const id = await submit('Portal rejected fixture');
  assert.ok((await repo.list('pending')).some(a => a.id === id));
  assert.ok((await repo.read(id)).contact_email);
  await assert.rejects(repo.reject(id, ' '), /rejection reason/);
  await repo.reject(id, 'Please correct the affiliation link.');
  assert.equal((await repo.read(id)).rejection_reason, 'Please correct the affiliation link.');
  const second = await submit('Portal approved fixture');
  await repo.approve(second);
  const approved = await repo.read(second);
  assert.equal(approved.status, 'approved');
  const organizerId = approved.approved_organizer_id;
  const memberships = await applicant.from('organizer_memberships').select('*').eq('organizer_id', organizerId);
  assert.ifError(memberships.error);
  assert.equal(memberships.data.length, 1);
  assert.equal(memberships.data[0].profile_id, users.applicant);
  const settings = await applicant.from('organizer_publishing_settings').select('weekly_cap').eq('organizer_id', organizerId).single();
  assert.ifError(settings.error); assert.equal(settings.data.weekly_cap, 3);
  // A fresh repository reads the persisted decision.
  const fresh = createSupabaseApplicationRepository(users.reviewerClient);
  assert.equal((await fresh.read(second)).approved_organizer_id, organizerId);
  const denied = createSupabaseApplicationRepository(users.ordinaryClient);
  await assert.rejects(denied.read(id), /Reviewer access required/);
  await assert.rejects(denied.approve(second), /Reviewer access required/);
  for (const client of [users.ordinaryClient, createClient(c.API_URL, c.PUBLISHABLE_KEY ?? c.ANON_KEY, options)]) {
    const forbidden = await client.rpc('reviewer_get_organizer_application', { p_application_id: id });
    assert.equal(forbidden.error?.code, '42501');
  }
  console.log('PASS: local reviewer login, private details, rejection, approval, membership, cap=3, persisted reload and nonreviewer/anonymous denial.');
} finally {
  // The caller owns this disposable stack; database reset/stop cleans fixtures.
  for (const client of clients) await client.auth.signOut({ scope: 'local' });
}
