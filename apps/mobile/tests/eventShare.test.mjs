import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShareMessage,
  buildSharePayload,
  safeShareUrl,
  shareEvent,
} from '../src/services/eventShare.ts';

const event = {
  title: 'Fall Gallery Opening',
  date: 'Tue, Nov 3',
  time: '6:00 PM',
  location: 'Bowker Auditorium',
  url: 'https://events.umass.edu/event/fall-gallery-opening',
};

test('message has title, date and time, location, link, and app name', () => {
  assert.equal(
    buildShareMessage(event),
    [
      'Fall Gallery Opening',
      '📅 Tue, Nov 3 · 6:00 PM',
      '📍 Bowker Auditorium',
      'https://events.umass.edu/event/fall-gallery-opening',
      'Shared from Amherst Connect',
    ].join('\n'),
  );
});

test('missing fields are skipped instead of leaving blank lines', () => {
  assert.equal(
    buildShareMessage({ title: '  Study Night  ', date: '', time: null, location: undefined }),
    'Study Night\nShared from Amherst Connect',
  );
});

test('date without time still shows', () => {
  assert.match(buildShareMessage({ title: 'A', date: 'Sat, Nov 7' }), /📅 Sat, Nov 7\n/);
});

test('empty title falls back to "Event"', () => {
  assert.equal(buildSharePayload({ title: '   ' }).title, 'Event');
});

test('only http(s) links are shared', () => {
  assert.equal(safeShareUrl('https://umass.edu/x'), 'https://umass.edu/x');
  assert.equal(safeShareUrl('http://umass.edu'), 'http://umass.edu');
  assert.equal(safeShareUrl('javascript:alert(1)'), null);
  assert.equal(safeShareUrl('https://bad url.com'), null);
  assert.equal(safeShareUrl(null), null);
  assert.doesNotMatch(buildShareMessage({ title: 'A', url: 'ftp://x' }), /ftp/);
});

test('payload puts the link inside the message for Android', () => {
  const payload = buildSharePayload(event);
  assert.equal(payload.title, 'Fall Gallery Opening');
  assert.match(payload.message, /https:\/\/events\.umass\.edu/);
});

test('shareEvent reports shared and dismissed from the share sheet', async () => {
  let sent;
  const shared = await shareEvent(event, {
    share: async (payload) => { sent = payload; return { action: 'sharedAction' }; },
    copy: async () => assert.fail('should not copy'),
  });
  assert.equal(shared, 'shared');
  assert.deepEqual(sent, buildSharePayload(event));

  const dismissed = await shareEvent(event, {
    share: async () => ({ action: 'dismissedAction' }),
    copy: async () => assert.fail('should not copy'),
  });
  assert.equal(dismissed, 'dismissed');
});

test('shareEvent copies the message when the share sheet is unavailable', async () => {
  let copied;
  const outcome = await shareEvent(event, {
    share: async () => { throw new Error('Share is not supported in this browser'); },
    copy: async (text) => { copied = text; },
  });
  assert.equal(outcome, 'copied');
  assert.equal(copied, buildShareMessage(event));
});

test('shareEvent returns failed when both share and copy fail', async () => {
  const outcome = await shareEvent(event, {
    share: async () => { throw new Error('no share'); },
    copy: async () => { throw new Error('no clipboard'); },
  });
  assert.equal(outcome, 'failed');
});
