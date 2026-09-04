/**
 * Splitting a bed into colour-compatible plates.
 *
 * The machine holds a fixed number of spools. Colours are per part, shared
 * colours cost one slot between the parts that use them, and a bed that needs
 * more distinct colours than the machine holds is split across plates - each
 * within the limit, and packed so shared colours keep the plate count down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitByColour } from '../js/colourplates.js';

test('everything on one plate when the colours fit the machine', () => {
  const r = splitByColour([
    { id: 'a', colours: ['red', 'blue'] },
    { id: 'b', colours: ['blue', 'green'] },
  ], 4);
  assert.equal(r.plateCount, 1, 'red, blue, green is three — fits four slots');
  assert.equal(r.splits, 0);
  assert.deepEqual(r.plates[0].colours, ['blue', 'green', 'red']);
});

test('a shared colour costs one slot, not two', () => {
  // Two parts, black shared: black,white and black,red is only three colours.
  const r = splitByColour([
    { id: 'a', colours: ['black', 'white'] },
    { id: 'b', colours: ['black', 'red'] },
  ], 4);
  assert.equal(r.plateCount, 1);
  assert.equal(r.plates[0].colours.length, 3, 'black counted once');
});

test('more distinct colours than the machine holds splits into plates', () => {
  const r = splitByColour([
    { id: 'a', colours: ['red', 'blue'] },
    { id: 'b', colours: ['green', 'yellow'] },
    { id: 'c', colours: ['black', 'white'] },
  ], 4);
  // 6 distinct colours, 4 slots: cannot be one plate.
  assert.ok(r.plateCount >= 2, 'it had to split');
  for (const plate of r.plates) {
    assert.ok(plate.colours.length <= 4, 'no plate exceeds the slot limit');
  }
  // Every part is placed exactly once.
  const placed = r.plates.flatMap((p) => p.parts).sort();
  assert.deepEqual(placed, ['a', 'b', 'c']);
});

test('packing shares colours to keep the plate count down', () => {
  // a,b,c pairwise share within four; d is disjoint. Best is two plates.
  const r = splitByColour([
    { id: 'a', colours: ['red', 'blue'] },
    { id: 'b', colours: ['red', 'blue'] },
    { id: 'c', colours: ['red', 'green'] },
    { id: 'd', colours: ['c1', 'c2', 'c3', 'c4'] },
  ], 4);
  assert.equal(r.plateCount, 2, 'the three red parts share one plate, d takes the other');
});

test('a part that alone needs more colours than the machine holds is surfaced', () => {
  const r = splitByColour([
    { id: 'ok', colours: ['red', 'blue'] },
    { id: 'toomany', colours: ['a', 'b', 'c', 'd', 'e'] },
  ], 4);
  assert.deepEqual(r.overflow, ['toomany'], 'the impossible part is flagged, not forced on');
  assert.ok(!r.plates.some((p) => p.parts.includes('toomany')));
});

test('parts with no colour of their own never force a split', () => {
  const r = splitByColour([
    { id: 'plain1', colours: [] },
    { id: 'plain2', colours: [] },
  ], 4);
  assert.equal(r.plateCount, 1);
  assert.deepEqual(r.plates[0].parts.sort(), ['plain1', 'plain2']);
});

test('the slot limit is honoured for a single-colour machine', () => {
  const r = splitByColour([
    { id: 'a', colours: ['red'] },
    { id: 'b', colours: ['blue'] },
  ], 1);
  assert.equal(r.plateCount, 2, 'one slot means one colour per plate');
});
