/**
 * The sync safety check that decides whether reconnecting adopts the file or
 * raises a conflict. It MUST treat a workshop whose only difference is the export
 * timestamp as the same — otherwise every reconnect looks like a change — while
 * catching a real difference, so unsynced local work is never silently replaced.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameWorkshop } from '../js/ui/sync.js';

const doc = (exportedAt, data) => JSON.stringify({ app: 'x', exportedAt, ...data });

test('only the export timestamp differs → the same workshop', () => {
  const a = doc('2026-01-01T00:00:00Z', { settings: { v: 1 }, projects: [{ id: 'p' }] });
  const b = doc('2026-12-31T23:59:59Z', { settings: { v: 1 }, projects: [{ id: 'p' }] });
  assert.equal(sameWorkshop(a, b), true);
});

test('a real difference (an added employee) → NOT the same, so a conflict is raised', () => {
  const a = doc('t1', { settings: { employees: [] } });
  const b = doc('t2', { settings: { employees: [{ id: 'e1', name: 'Alex' }] } });
  assert.equal(sameWorkshop(a, b), false);
});

test('unparseable text is never treated as a match', () => {
  assert.equal(sameWorkshop('not json', doc('t', {})), false);
});
