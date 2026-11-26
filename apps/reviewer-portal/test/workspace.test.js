import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { createFixtureReviews } from '../src/reviews.js';
import { createWorkspace } from '../src/workspace.js';

function setup(t, applicationRepository) {
  const window = new Window();
  const { document } = window;
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = document;
  globalThis.matchMedia = window.matchMedia.bind(window);
  t.after(() => {
    Object.assign(globalThis, previous);
    return window.close();
  });
  const element = (tag, attributes, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };
  const button = (text, click, className) => {
    const node = element('button', { class: className ?? '' }, text);
    node.addEventListener('click', click);
    return node;
  };
  let authorized = true;
  const state = { reviews: createFixtureReviews() };
  createWorkspace({ element, button, show: (...nodes) => document.body.replaceChildren(...nodes),
    applicationRepository, isCurrent: candidate => authorized && candidate === state, signOutButton: () => element('button', {}, 'Sign out') })(state);
  const click = text => {
    const node = [...document.querySelectorAll('button')].find(item => item.textContent === text);
    assert.ok(node, 'Missing button: ' + text);
    node.click();
  };
  return { document, click, reviews: state.reviews, deny: () => { authorized = false; } };
}

test('application filters expose four states and decisions validate before updating the queue', t => {
  const { document, click, reviews } = setup(t);
  for (const label of ['Pending 2', 'Approved 5', 'Rejected 1', 'Revoked 1']) {
    assert.ok([...document.querySelectorAll('.pill')].some(button => button.textContent === label));
  }
  click('Reject');
  assert.match(document.querySelector('#review-details [role="alert"]').textContent, /rejection reason/);
  document.querySelector('#decision-reason').value = 'Affiliation missing';
  click('Reject');
  assert.match(document.querySelector('#review-details').textContent, /Affiliation missing/);
  click('Pending 1');
  document.querySelector('#publication-cap').value = '4';
  document.querySelector('fieldset input').click();
  click('Approve organizer');
  assert.equal(reviews.organizer('org-bookshop').cap, 4);
  assert.equal(reviews.get('bookshop').checks.length, 1);
  click('Pending 0');
  assert.match(document.querySelector('.empty').textContent, /No pending applications/);
});

test('listing search, linked organizer detail, moderation actions, and audit stay in sync', t => {
  const { document, click } = setup(t);
  click('Listings');
  const search = document.querySelector('#listing-search');
  search.value = 'short film';
  search.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  click('Short film showcase');
  const detail = () => document.querySelector('#review-details');
  assert.match(detail().textContent, /Campus Film Society/);
  document.querySelector('#decision-reason').value = 'Individual removal';
  click('Remove listing');
  assert.match(detail().textContent, /Removed/);
  click('Campus Film Society');
  assert.match(document.querySelector('.work-area').textContent, /Documentary discussion/);
  document.querySelector('#decision-reason').value = 'Bulk removal';
  click('Remove all listings');
  assert.match(document.querySelector('.work-area').textContent, /Removed all live listings/);
  document.querySelector('#decision-reason').value = 'Revocation note';
  click('Revoke approval');
  assert.match(detail().textContent, /Revocation note/);
  click('Audit Log');
  assert.match(document.querySelector('table').textContent, /Revoked approval/);
  assert.match(document.querySelector('table').textContent, /Individual removal/);
});

test('a stale workspace action cannot mutate demo records after access is lost', t => {
  const { click, deny, reviews } = setup(t);
  deny();
  click('Approve organizer');
  assert.equal(reviews.list('pending').length, 2);
});

test('live Applications does not show fixture applications; the other tabs stay labeled previews', async t => {
  const { document, click } = setup(t, { list: async () => [], read: async () => null });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(document.body.textContent, /No pending applications/);
  assert.doesNotMatch(document.body.textContent, /Sample records/);
  for (const tab of ['Organizers', 'Listings', 'Audit Log']) {
    click(tab);
    assert.match(document.body.textContent, /Sample records.*preview only/);
  }
  click('Applications');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(document.body.textContent, /No pending applications/);
});
