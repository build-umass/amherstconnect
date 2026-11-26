import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createLiveApplications } from '../src/liveApplications.js';
import { createSupabaseApplicationRepository } from '../src/applicationRepository.js';

const row = (id, status = 'pending') => ({
  id, status, organizer_name: 'Organizer ' + id, organizer_kind: 'individual',
  contact_name: 'Fixture Contact', contact_role: 'Host', contact_email: 'fixture@example.test',
  plans_events: true, plans_deals: false, estimated_posting_frequency: 'weekly',
  created_at: '2026-11-20T15:00:00Z', organizer_terms_accepted_at: '2026-11-20T15:00:00Z',
  affiliation_url: 'https://example.test', about: 'Community events.', rejection_reason: null,
});
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(t, overrides = {}) {
  const window = new Window();
  t.after(() => window.close());
  const { document } = window;
  let active = true;
  const records = [row('one'), row('two')];
  const calls = [];
  let queueError = false;
  let detailError = false;
  let decisionError = false;
  const client = { async rpc(name, args) {
    calls.push([name, args]);
    if (name === 'is_content_reviewer') return { data: true, error: null };
    if (name === 'reviewer_list_organizer_applications') {
      if (queueError) return { error: { code: 'NETWORK' } };
      return { data: records.filter(a => a.status === args.p_status).map(a => ({ ...a })) };
    }
    if (name === 'reviewer_get_organizer_application') {
      if (detailError) return { error: { code: 'NETWORK' } };
      return { data: records.filter(a => a.id === args.p_application_id).map(a => ({ ...a })) };
    }
    if (decisionError) return { error: { code: '55000' } };
    const record = records.find(a => a.id === args.p_application_id);
    record.status = name === 'approve_organizer_application' ? 'approved' : 'rejected';
    record.rejection_reason = args.p_reason ?? null;
    return { data: [{ application_id: record.id, status: record.status }] };
  } };
  const repository = createSupabaseApplicationRepository(client, { getSessionUserId: () => 'reviewer' });
  Object.assign(repository, overrides);
  const element = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  };
  const button = (label, fn, cls = '') => {
    const node = element('button', { type: 'button', class: cls }, label);
    node.addEventListener('click', fn);
    return node;
  };
  const ui = createLiveApplications({ element, button, repository, isActive: () => active });
  document.body.append(ui.view());
  const click = name => {
    const node = [...document.querySelectorAll('button')].find(b => b.textContent === name);
    assert.ok(node, 'Missing button ' + name);
    node.click();
  };
  return { document, records, calls, ui, click, element, button,
    deactivate: () => { active = false; document.body.replaceChildren(); },
    failQueue: value => { queueError = value; }, failDetail: value => { detailError = value; },
    failDecision: value => { decisionError = value; } };
}

test('live queue loads details, requires rejection reason, saves decisions and survives remount', async t => {
  const v = setup(t);
  assert.match(v.document.body.textContent, /Loading applications/);
  await settle();
  assert.match(v.document.body.textContent, /fixture@example.test/);
  v.click('Reject');
  assert.match(v.document.body.textContent, /Enter a rejection reason/);
  assert.equal(v.calls.filter(([name]) => name === 'reject_organizer_application').length, 0);
  v.document.querySelector('#application-reason').value = 'Affiliation needs correction';
  v.click('Reject');
  await settle();
  assert.equal(v.records[0].status, 'rejected');
  assert.match(v.document.body.textContent, /The reason was saved/);
  assert.match(v.document.body.textContent, /Affiliation needs correction/);
  v.click('Pending');
  await settle();
  assert.equal(v.document.querySelector('#initial-cap').value, '3');
  v.click('Approve organizer');
  v.click('Approve organizer');
  await settle();
  assert.equal(v.calls.filter(([name]) => name === 'approve_organizer_application').length, 1);
  assert.deepEqual(v.calls.find(([name]) => name === 'approve_organizer_application')[1],
    { p_application_id: 'two', p_weekly_cap: 3 });
  assert.match(v.document.body.textContent, /Publishing access and the weekly cap were saved/);
  // Remount reloads remote state rather than relying on fixture/session memory.
  const repository = { list: async status => v.records.filter(r => r.status === status), read: async id => v.records.find(r => r.id === id) };
  const remounted = createLiveApplications({ element: v.element, button: v.button, repository, isActive: () => true });
  v.document.body.replaceChildren(remounted.view());
  await settle();
  assert.match(v.document.body.textContent, /No pending applications/);
});

test('queue, details and action errors remain visible and retryable; empty filters are honest', async t => {
  const v = setup(t);
  v.failQueue(true);
  await settle();
  assert.match(v.document.body.textContent, /could not be completed/);
  v.failQueue(false); v.click('Retry applications');
  await settle();
  v.failDetail(true); v.click('Organizer two');
  await settle();
  assert.match(v.document.body.textContent, /could not be completed/);
  assert.equal(v.document.querySelector('#initial-cap'), null);
  v.failDetail(false); v.click('Retry details');
  await settle();
  v.failDecision(true); v.click('Approve organizer');
  await settle();
  assert.match(v.document.body.textContent, /already changed/);
  assert.equal(v.records[1].status, 'pending');
  v.click('Withdrawn');
  await settle();
  assert.match(v.document.body.textContent, /No withdrawn applications/);
});

test('late private responses do not render after session access is lost', async t => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const v = setup(t, { list: () => pending });
  v.deactivate();
  resolve([row('private')]);
  await settle();
  assert.equal(v.document.body.textContent, '');
});

test('permission failures do not reveal details; stale session checks cannot send a decision', async () => {
  let actor = 'reviewer-one';
  const calls = [];
  const repository = createSupabaseApplicationRepository({ async rpc(name) {
    calls.push(name);
    actor = 'reviewer-two';
    return { data: true };
  } }, { getSessionUserId: () => actor });
  await assert.rejects(repository.approve('id'), /session changed/);
  assert.deepEqual(calls, ['is_content_reviewer']);

  const denied = createSupabaseApplicationRepository({ async rpc() { return { error: { code: '42501' } }; } });
  await assert.rejects(denied.read('id'), /Reviewer access required/);
});

test('missing application details are explicit and expose no decision controls', async t => {
  const v = setup(t, { read: async () => null });
  await settle();
  assert.match(v.document.body.textContent, /Application not found/);
  assert.equal(v.document.querySelector('#initial-cap'), null);
});

test('a reviewer decision cannot run twice during an outstanding request', async t => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  let calls = 0;
  const v = setup(t, { approve: () => { calls++; return pending; } });
  await settle();
  v.click('Approve organizer');
  assert.match(v.document.body.textContent, /Saving decision/);
  assert.equal(v.document.querySelector('#initial-cap').disabled, true);
  v.click('Approve organizer');
  assert.equal(calls, 1);
  resolve();
  await settle();
});
