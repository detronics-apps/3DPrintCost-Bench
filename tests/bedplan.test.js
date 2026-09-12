import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeBed } from '../js/bedplan.js';

const build = { x: 220, y: 220, z: 250 };

test('several different parts are placed with positions, none overlapping', () => {
  const plan = arrangeBed([
    { id: 'a', label: 'Bracket', size: { x: 40, y: 30 }, count: 6 },
    { id: 'b', label: 'Cover', size: { x: 60, y: 60 }, count: 2 },
  ], build);

  assert.ok(plan.plates.length >= 1);
  const all = plan.plates.flatMap((p) => p.placements);
  assert.equal(all.length, 8, 'every unit is placed');
  assert.ok(all.every((pl) => Number.isFinite(pl.x) && Number.isFinite(pl.y)), 'each has a position');

  // No two placements on the same plate overlap.
  for (const plate of plan.plates) {
    for (let i = 0; i < plate.placements.length; i += 1) {
      for (let j = i + 1; j < plate.placements.length; j += 1) {
        const a = plate.placements[i];
        const b = plate.placements[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `placements ${i} and ${j} overlap on a plate`);
      }
    }
  }
  // Everything sits within the usable bed.
  for (const plate of plan.plates) {
    for (const pl of plate.placements) {
      assert.ok(pl.x >= -1e-6 && pl.y >= -1e-6);
      assert.ok(pl.x + pl.w <= plan.area.w + 1e-6 && pl.y + pl.h <= plan.area.h + 1e-6);
    }
  }
});

test('parts too big for the bed are flagged as overflow, not placed', () => {
  const plan = arrangeBed([
    { id: 'huge', label: 'Huge', size: { x: 500, y: 500 }, count: 1 },
    { id: 'ok', label: 'Fine', size: { x: 30, y: 30 }, count: 1 },
  ], build);
  assert.deepEqual(plan.overflow, ['huge']);
  assert.equal(plan.plates.flatMap((p) => p.placements).length, 1, 'only the fitting part is placed');
});

test('placements carry height, and a reserved tower keeps its strip clear', () => {
  const plan = arrangeBed([{ id: 'a', label: 'A', size: { x: 40, y: 30, z: 22 }, count: 3 }],
    build, { reserve: { x: 30, y: 30 } });
  const all = plan.plates.flatMap((p) => p.placements);
  assert.ok(all.every((pl) => pl.z === 22), 'height rides through to every placement for the 3-D view');
  assert.ok(plan.reserve && plan.reserve.w === 30 && plan.reserve.h === 30, 'the tower rect is reported');
  // No part overlaps the reserved tower, wherever on the plate it sits.
  const t = plan.reserve;
  for (const pl of all) {
    const overlaps = pl.x < t.x + t.w && pl.x + pl.w > t.x && pl.y < t.y + t.h && pl.y + pl.h > t.y;
    assert.ok(!overlaps, 'no part overlaps the reserved tower');
  }
});

test('each placement carries the part materials, so a plate can decide its own tower', () => {
  const plan = arrangeBed([
    { id: 'a', label: 'A', size: { x: 40, y: 30 }, count: 2, materials: ['petg'] },
    { id: 'b', label: 'B', size: { x: 40, y: 30 }, count: 1, materials: ['petg', 'pla'] },
  ], build);
  const byId = (id) => plan.plates.flatMap((p) => p.placements).filter((pl) => pl.id === id);
  assert.deepEqual(byId('a')[0].materials, ['petg'], 'a single-colour part carries one material');
  assert.deepEqual(byId('b')[0].materials, ['petg', 'pla'], 'a multi-colour part carries both');
});

test('a tall part does not waste the space beside it (no unnecessary extra bed)', () => {
  // 40 small parts plus one tall part. A shelf packer strands a couple of small
  // parts on an extra plate; the guillotine packer fills the space beside the tall
  // one, so they fit in far fewer beds.
  const plan = arrangeBed([
    { id: 'small', label: 'Small', size: { x: 60, y: 40, z: 23 }, count: 40 },
    { id: 'tall', label: 'Tall', size: { x: 130, y: 170, z: 200 }, count: 1 },
  ], build);
  const placed = plan.plates.flatMap((p) => p.placements).length;
  assert.equal(placed, 41, 'everything is placed');
  assert.ok(plan.plateCount <= 4, `should pack tightly, used ${plan.plateCount} beds`);
  // No plate overlaps (the guillotine split must never overlap).
  for (const plate of plan.plates) {
    for (let i = 0; i < plate.placements.length; i += 1) {
      for (let j = i + 1; j < plate.placements.length; j += 1) {
        const a = plate.placements[i];
        const b = plate.placements[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, 'no two parts overlap');
      }
    }
  }
});

test('a full bed spills onto a second plate', () => {
  // 100x100 footprints on a 220x220 usable-ish bed: at most 4 per plate.
  const plan = arrangeBed([{ id: 'big', label: 'Big', size: { x: 100, y: 100 }, count: 6 }], build);
  assert.ok(plan.plateCount >= 2, 'six large parts cannot share one plate');
});
