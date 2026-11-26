import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createManagementRepository } from '../src/managementRepository.js';
import { createLiveManagement } from '../src/liveManagement.js';
const settle = () => new Promise(resolve => setImmediate(resolve));
function queryClient(allowed = true) {
  const calls = [];
  const client = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'is_content_reviewer' ? allowed : null }; },
    from(table) {
      calls.push(['from', table]);
      const query = {};
      for (const method of ['select', 'not', 'eq', 'order', 'limit', 'maybeSingle']) {
        query[method] = (...args) => { calls.push([method, ...args]); return query; };
      }
      query.then = (resolve, reject) => Promise.resolve({ data: [] }).then(resolve, reject);
      return query;
    },
  };
  return { client, calls };
}
test('management calls deny nonreviewers before any data reads or writes', async () => {
  const { client, calls } = queryClient(false);
  const repo = createManagementRepository(client);
  for (const fn of [() => repo.organizers(), () => repo.events(), () => repo.audit(),
    () => repo.contact('org'), () => repo.removeEvent('event')]) await assert.rejects(fn, /Reviewer access required/);
  assert.ok(calls.every(([name]) => name === 'is_content_reviewer'));
});
test('repository reads only merged tables and restricts removal to the existing event RPC', async () => {
  const { client, calls } = queryClient();
  const repo = createManagementRepository(client);
  await repo.organizers(); await repo.events(); await repo.audit('org'); await repo.contact('org'); await repo.removeEvent('event');
  assert.deepEqual(calls.filter(([name]) => name === 'from').map(c => c[1]),
    ['organizers', 'events', 'audit_log', 'organization_contacts']);
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'source_type' && c[2] === 'amherst_connect'));
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'));
  assert.deepEqual(calls.at(-1), ['remove_organizer_event', { p_event_id: 'event' }]);
});
test('session switches during permission checks cannot submit removal', async () => {
  let actor = 'one';
  const repo = createManagementRepository({
    rpc: async name => { assert.equal(name, 'is_content_reviewer'); actor = 'two'; return { data: true }; },
  }, { getSessionUserId: () => actor });
  await assert.rejects(repo.removeEvent('event'), /session changed/);
});

function setup(t, overrides = {}) {
  const window = new Window(); t.after(() => window.close());
  const document = window.document;
  const element = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children); return node;
  };
  const button = (text, action, cls = '') => {
    const node = element('button', { class: cls }, text); node.addEventListener('click', action); return node;
  };
  const events = [{ id: 'event', title: 'Community event', organizer_id: 'org', organizers: { name: 'Approved organizer' }, status: 'published' }];
  const organizers = [{ id: 'org', name: 'Approved organizer', active: true, approved_at: '2026-11-26T15:00:00Z',
    organizer_publishing_settings: { weekly_cap: 3 } }];
  const activity = [{ id: 'audit', action: 'application_approved', actor_profile_id: 'reviewer',
    organizer_id: 'org', created_at: '2026-11-26T15:00:00Z' }];
  let count = 0, active = true;
  const repo = {
    organizers: async () => organizers, events: async () => events,
    contact: async () => ({ contact_email: 'fixture@example.test' }), audit: async () => activity,
    removeEvent: async () => { count++; events.splice(0); activity.unshift({ ...activity[0], id: 'removal', action: 'event_update' }); },
    ...overrides,
  };
  const view = createLiveManagement({ element, button, repository: repo, isActive: () => active });
  const open = tab => document.body.replaceChildren(view.view(tab));
  const click = label => {
    const node = [...document.querySelectorAll('button')].find(b => b.textContent === label);
    assert.ok(node, 'Missing ' + label); node.click();
  };
  return { document, open, click, count: () => count, deactivate: () => { active = false; document.body.replaceChildren(); } };
}
test('organizer details show real limits, private contacts, events and audit without unsupported actions', async t => {
  const v = setup(t); v.open('Organizers');
  assert.match(v.document.body.textContent, /Loading organizers/);
  await settle(); v.click('Approved organizer'); await settle();
  assert.match(v.document.body.textContent, /Weekly publication cap: 3/);
  assert.match(v.document.body.textContent, /fixture@example.test/);
  assert.match(v.document.body.textContent, /Community event/);
  assert.match(v.document.body.textContent, /application approved/);
  assert.ok(![...v.document.querySelectorAll('button')].some(b => /Revoke|Save cap|Remove all/.test(b.textContent)));
});
test('individual removal requires confirmation, saves once, refreshes results and audit', async t => {
  const v = setup(t); v.open('Listings'); await settle();
  v.click('Remove event'); assert.equal(v.count(), 0);
  v.click('Cancel'); assert.equal(v.count(), 0);
  v.click('Remove event'); v.click('Confirm removal'); v.click('Confirm removal');
  await settle(); assert.equal(v.count(), 1);
  assert.match(v.document.body.textContent, /Organizer posting access is unchanged/);
  assert.match(v.document.body.textContent, /No matching published organizer events/);
  v.open('Audit Log'); await settle();
  assert.match(v.document.body.textContent, /event update/);
});
test('failures offer retry, empty data stays empty, and stale responses do not reveal contacts', async t => {
  let fail = true;
  const v = setup(t, { organizers: async () => { if (fail) throw new Error('Connection unavailable'); return []; } });
  v.open('Organizers'); await settle();
  assert.match(v.document.body.textContent, /Connection unavailable/);
  fail = false; v.click('Try again'); await settle();
  assert.match(v.document.body.textContent, /No approved organizers/);
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const stale = setup(t, { organizers: () => pending });
  stale.open('Organizers'); stale.deactivate(); resolve([{ name: 'Private data' }]); await settle();
  assert.equal(stale.document.body.textContent, '');
});

test('an old removal response cannot replace the newly selected tab', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const v = setup(t, { removeEvent: () => pending });
  v.open('Listings'); await settle();
  v.click('Remove event'); v.click('Confirm removal');
  v.open('Audit Log'); await settle();
  finish(); await settle();
  assert.equal(v.document.querySelector('h1').textContent, 'Audit log');
  assert.doesNotMatch(v.document.body.textContent, /Event removed/);
});

test('listing search uses organizer names and event details preserve the split layout', async t => {
  const v = setup(t); v.open('Listings'); await settle();
  const search = v.document.querySelector('input[type="search"]');
  search.value = 'Approved organizer';
  search.dispatchEvent(new v.document.defaultView.Event('input'));
  assert.match(v.document.body.textContent, /Community event/);
  v.click('Community event');
  assert.ok(v.document.querySelector('.split aside[aria-label="Event details"]'));
  assert.ok(v.document.querySelector('.cell-label'));
});
