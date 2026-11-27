import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/utils/dateTime.ts', import.meta.url),
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;

const { formatDateTime, formatDealExpiry } = await import(
  'data:text/javascript;base64,' +
  Buffer.from(compiled).toString('base64')
);

test('formats UTC dates in New York time', () => {
  assert.equal(
    formatDateTime('2026-11-30T22:30:00Z'),
    'Nov 30, 5:30 PM'
  );
});

test('uses New York calendar days around midnight', () => {
  const now = new Date('2026-11-26T00:30:00Z');

  assert.equal(
    formatDealExpiry('2026-11-26T03:30:00Z', now),
    'Ends today · Nov 25, 10:30 PM'
  );

  assert.equal(
    formatDealExpiry('2026-11-26T15:00:00Z', now),
    'Ends tomorrow · Nov 26, 10:00 AM'
  );
});

test('handles daylight saving time', () => {
  assert.equal(
    formatDateTime('2026-03-08T07:30:00Z'),
    'Mar 8, 3:30 AM'
  );
});

test('shows an explicit end date', () => {
  assert.equal(
    formatDealExpiry(
      '2026-11-30T22:30:00Z',
      new Date('2026-11-26T18:00:00Z')
    ),
    'Ends Nov 30, 5:30 PM'
  );
});

test('handles invalid dates', () => {
  assert.equal(formatDateTime('invalid'), 'Date unavailable');
  assert.equal(
    formatDealExpiry('invalid'),
    'Expiration date unavailable'
  );
});
