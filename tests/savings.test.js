/**
 * "Fill a plate and save."
 *
 * The claim the chart makes to a customer has to be true: a full plate of a part
 * costs less each than one on its own, and the saving it reports is that real
 * difference. It must never invent a saving where there is none, and it must
 * price through the same engine as everything else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateSaving, sampleQuantities } from '../js/savings.js';
import { defaultSettings } from '../js/settings.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const line = () => ({
  profileId: 'function',
  printerId: 'bambu-x1e',
  materialId: 'petg-dark-grey',
  geometry: analyse(box(30, 30, 20)),
  colours: 1,
  hardware: [],
});

test('sample quantities run from one to a full plate', () => {
  assert.deepEqual(sampleQuantities(1), [1]);
  assert.deepEqual(sampleQuantities(2), [1, 2]);
  const s = sampleQuantities(12);
  assert.equal(s[0], 1, 'starts at one');
  assert.equal(s[s.length - 1], 12, 'ends at the full plate');
});

test('a full plate is cheaper per part, and the saving is that difference', () => {
  const s = plateSaving(line(), defaultSettings());
  assert.ok(s.perPlate > 1, 'this small part fits several to a plate');
  assert.ok(s.platePrice < s.one, 'each part is cheaper when the plate is full');
  const expected = (s.one - s.platePrice) / s.one;
  assert.ok(Math.abs(s.savingPercent - expected) < 1e-9, 'the saving is the real per-part difference');
  assert.ok(s.savingPercent > 0 && s.savingPercent < 1);
});

test('the points are priced at increasing quantities and fall monotonically', () => {
  const s = plateSaving(line(), defaultSettings());
  for (let i = 1; i < s.points.length; i += 1) {
    assert.ok(s.points[i].quantity > s.points[i - 1].quantity, 'quantities increase');
    assert.ok(s.points[i].unitPrice <= s.points[i - 1].unitPrice + 1e-9,
      'the per-part price never goes up as the plate fills');
  }
});
