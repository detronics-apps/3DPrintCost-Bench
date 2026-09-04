/**
 * Several part types sharing one bed.
 *
 * The property that matters most here is the one a naive model gets wrong:
 * TOTAL plates for a mixed bed must never exceed the sum of what each type
 * would need on its own, and must usually be LESS than that sum, because
 * mixing shapes on shared plates is the whole point of loading the printer
 * once. A model that just adds up each type's independent plate count has not
 * actually shared anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packBed, itemPlacement } from '../js/bedpacking.js';
import { partsPerPlate } from '../js/geometry.js';

const BUILD = { x: 256, y: 256, z: 256 };

test('one type alone matches the existing single-type calculation exactly', () => {
  const size = { x: 40, y: 40, z: 20 };
  const solo = partsPerPlate(size, BUILD);
  const packed = packBed([{ id: 'a', size, quantity: solo * 3 }], BUILD);

  assert.equal(packed.jobs, 3, `${solo} per plate x3 quantity should be exactly 3 plates`);
  const placement = itemPlacement(packed, 'a');
  assert.equal(placement.jobs, 3);
  assert.equal(placement.perPlate, solo);
});

test('mixing two shapes uses fewer plates than pricing each type alone would', () => {
  const small = { x: 30, y: 30, z: 15 };
  const large = { x: 80, y: 80, z: 15 };
  // Chosen so there is real slack: 3 large parts leave a quarter-plate of
  // capacity spare (solo capacity is 4-to-a-plate), which is exactly the kind
  // of leftover room sharing a bed is supposed to use.
  const qtySmall = 5;
  const qtyLarge = 3;

  const soloSmallPlates = Math.ceil(qtySmall / partsPerPlate(small, BUILD));
  const soloLargePlates = Math.ceil(qtyLarge / partsPerPlate(large, BUILD));
  const naiveSum = soloSmallPlates + soloLargePlates;

  const packed = packBed([
    { id: 'small', size: small, quantity: qtySmall },
    { id: 'large', size: large, quantity: qtyLarge },
  ], BUILD);

  assert.ok(packed.jobs <= naiveSum,
    `sharing plates (${packed.jobs}) must not need more than pricing each type alone (${naiveSum})`);
  assert.ok(packed.jobs < naiveSum,
    `and here there is genuinely spare room to share, so it should need fewer: `
    + `${packed.jobs} vs ${naiveSum}`);
});

test('slack that is not there is not invented: exact quantities need the naive sum', () => {
  // The counterpart to the test above. When large parts already fill their own
  // plate exactly (4-to-a-plate, quantity 4), there is no spare room, and
  // packing must not pretend otherwise.
  const large = { x: 80, y: 80, z: 15 };
  const soloCapacity = partsPerPlate(large, BUILD);
  const packed = packBed([{ id: 'large', size: large, quantity: soloCapacity * 2 }], BUILD);
  assert.equal(packed.jobs, 2, 'two exact plates worth of the same shape needs exactly two plates');
});

test('every unit ordered is actually placed somewhere', () => {
  const packed = packBed([
    { id: 'a', size: { x: 20, y: 20, z: 10 }, quantity: 37 },
    { id: 'b', size: { x: 50, y: 30, z: 40 }, quantity: 9 },
  ], BUILD);

  for (const id of ['a', 'b']) {
    const entry = packed.perItem[id];
    const placed = entry.plateCounts.reduce((t, c) => t + c, 0);
    assert.equal(placed, entry.totalUnits, `${id}: every unit must land on a plate`);
  }
});

test('a part too tall for the machine is reported as impossible, not silently dropped', () => {
  const packed = packBed([
    { id: 'fits', size: { x: 20, y: 20, z: 10 }, quantity: 4 },
    { id: 'toobig', size: { x: 20, y: 20, z: 300 }, quantity: 2 },
  ], BUILD);

  assert.ok(packed.impossible.includes('toobig'));
  assert.equal(packed.perItem.toobig.plateCounts.reduce((t, c) => t + c, 0), 0,
    'nothing impossible is ever placed');
  assert.ok(packed.perItem.fits.plateCounts.reduce((t, c) => t + c, 0) > 0,
    'and a real part is not blocked by an impossible one in the same order');
});

test('a purge tower is reserved once per plate, not once per part type', () => {
  const size = { x: 40, y: 40, z: 20 };
  const withoutTower = packBed([
    { id: 'a', size, quantity: 20 }, { id: 'b', size, quantity: 20 },
  ], BUILD, { reservedArea: 0 });
  const withTower = packBed([
    { id: 'a', size, quantity: 20 }, { id: 'b', size, quantity: 20 },
  ], BUILD, { reservedArea: 900 });

  assert.ok(withTower.jobs >= withoutTower.jobs, 'a tower can only cost space, never save it');
  // The tower is not multiplied by the number of TYPES sharing the bed: two
  // types with a tower must need at most one extra plate over one type alone
  // with the same tower and double the quantity, not two extra.
  const oneTypeDoubleQty = packBed([{ id: 'a', size, quantity: 40 }], BUILD, { reservedArea: 900 });
  assert.ok(withTower.jobs <= oneTypeDoubleQty.jobs + 1,
    `splitting one quantity across two types must not multiply the tower cost: `
    + `${withTower.jobs} vs ${oneTypeDoubleQty.jobs}`);
});

test('an empty order needs no plates and throws nothing', () => {
  const packed = packBed([], BUILD);
  assert.equal(packed.jobs, 0);
  assert.deepEqual(packed.plates, []);

  const zeroQty = packBed([{ id: 'a', size: { x: 10, y: 10, z: 10 }, quantity: 0 }], BUILD);
  assert.equal(zeroQty.jobs, 0);
});

test('itemPlacement on a type that never got an order is zero, not a crash', () => {
  const packed = packBed([{ id: 'a', size: { x: 10, y: 10, z: 10 }, quantity: 1 }], BUILD);
  const missing = itemPlacement(packed, 'nonexistent');
  assert.deepEqual(missing, { jobs: 0, perPlate: 0, plateCounts: [] });
});

test('quantity that exactly fills whole plates never spills an extra empty one', () => {
  const size = { x: 40, y: 40, z: 20 };
  const solo = partsPerPlate(size, BUILD);
  const packed = packBed([{ id: 'a', size, quantity: solo * 4 }], BUILD);
  assert.equal(packed.jobs, 4);
});

test('a sweep over shapes, quantities and towers produces no NaN and no negative', () => {
  const shapes = [
    { x: 10, y: 10, z: 10 }, { x: 50, y: 50, z: 30 }, { x: 200, y: 200, z: 200 }, { x: 5, y: 5, z: 250 },
  ];
  for (const tower of [0, 300, 5000]) {
    for (const qtyA of [0, 1, 13, 100]) {
      for (const qtyB of [0, 1, 7, 50]) {
        const packed = packBed([
          { id: 'a', size: shapes[0], quantity: qtyA },
          { id: 'b', size: shapes[3], quantity: qtyB },
        ], BUILD, { reservedArea: tower });
        assert.ok(Number.isFinite(packed.jobs) && packed.jobs >= 0);
        for (const id of ['a', 'b']) {
          const p = itemPlacement(packed, id);
          assert.ok(Number.isFinite(p.jobs) && p.jobs >= 0, `${id} jobs`);
          assert.ok(Number.isFinite(p.perPlate) && p.perPlate >= 0, `${id} perPlate`);
        }
      }
    }
  }
});
