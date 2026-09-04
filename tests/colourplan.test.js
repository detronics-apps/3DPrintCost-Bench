/**
 * Colour by Z-height and the pause-swaps it implies.
 *
 * The machine loads the first few colours from the bottom up and changes those
 * automatically; a colour beyond that is reached by pausing at its height and
 * swapping by hand. Each swap is scheduled ("at 24 mm: blue → green"), costs
 * labour and a machine wait, and makes the plate attended-only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partColourPlan, swapCost, bandColours } from '../js/colourplan.js';

const bands = [
  { upTo: 10, materialId: 'red' },
  { upTo: 24, materialId: 'blue' },
  { upTo: 30, materialId: 'green' },
];

test('colours are listed bottom to top', () => {
  assert.deepEqual(bandColours(bands), ['red', 'blue', 'green']);
});

test('within the heads, everything is automatic — no swaps', () => {
  const plan = partColourPlan(bands, { heads: 4 });
  assert.deepEqual(plan.loaded, ['red', 'blue', 'green']);
  assert.equal(plan.swapCount, 0);
  assert.equal(plan.needsAttendance, false);
});

test('a colour beyond the heads becomes a pause-swap at its height', () => {
  const plan = partColourPlan(bands, { heads: 2 });
  assert.deepEqual(plan.loaded, ['red', 'blue'], 'the first two from the bottom load');
  assert.deepEqual(plan.manual, ['green']);
  assert.equal(plan.swapCount, 1);
  assert.deepEqual(plan.swaps[0], { atHeight: 24, from: 'blue', to: 'green' },
    'the swap is scheduled at the height blue ends and green begins');
  assert.equal(plan.needsAttendance, true, 'a manual swap means someone must be there');
});

test('ten colours on a single-head machine is nine swaps', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ upTo: (i + 1) * 5, materialId: `c${i}` }));
  const plan = partColourPlan(many, { heads: 1 });
  assert.deepEqual(plan.loaded, ['c0']);
  assert.equal(plan.swapCount, 9, 'every colour after the first is a hand swap');
  assert.equal(plan.swaps[0].to, 'c1');
  assert.equal(plan.swaps[8].to, 'c9');
});

test('swap cost is labour plus a machine wait, and forces attendance', () => {
  const c = swapCost(2, { swapLabourMinutes: 3, swapWaitMinutes: 20, rate: 120 });
  assert.equal(c.labourMinutes, 6, '3 min hands-on each');
  assert.equal(c.waitMinutes, 40, 'the machine sits paused ~20 min until someone gets to it');
  assert.equal(c.labourCost, (6 / 60) * 120);
  assert.equal(c.needsAttendance, true);
});

test('no swaps costs nothing and needs no attendance', () => {
  const c = swapCost(0, { rate: 120 });
  assert.equal(c.labourCost, 0);
  assert.equal(c.waitMinutes, 0);
  assert.equal(c.needsAttendance, false);
});
