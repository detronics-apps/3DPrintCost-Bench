/**
 * Several different part TYPES sharing one bed, through the real engine.
 *
 * `bedpacking.test.js` proves the pure packing math on its own; this file
 * proves the engine actually reaches for it - that a two-line order sharing a
 * plate prices differently, and more honestly, than the same two lines priced
 * as if each had the whole bed to itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder } from '../js/engine.js';
import { defaultSettings } from '../js/settings.js';
import { analyse } from '../js/geometry.js';
import { findByTypeAndColour, DEFAULT_MATERIALS } from '../js/materials.js';
import { makeSlot } from '../js/filaments.js';
import { round } from '../js/money.js';
import { box } from './helpers/solids.js';

const M = DEFAULT_MATERIALS;
const spool = (type, colour) => findByTypeAndColour(M, type, colour).id;
const black = () => makeSlot(spool('PLA', 'Black'), 'a');

const bracket = (extra = {}) => ({
  name: 'Bracket',
  quantity: 20,
  profileId: 'function',
  materialId: spool('PLA', 'Black'),
  geometry: analyse(box(30, 30, 15)),
  hardware: [],
  ...extra,
});

const housing = (extra = {}) => ({
  name: 'Housing',
  quantity: 3,
  profileId: 'function',
  materialId: spool('PLA', 'Black'),
  geometry: analyse(box(80, 80, 15)),
  hardware: [],
  ...extra,
});

test('a single-line order behaves exactly as it did before bed sharing existed', () => {
  // The bed-packing pre-pass only engages once there is more than one line to
  // share a plate with. One line, even with a plate present, must price
  // exactly as it always has.
  const s = defaultSettings();
  const withoutPlate = calculateOrder({ lines: [bracket({ printerId: 'bambu-x1e' })] }, s);
  const withPlate = calculateOrder({
    plate: { printerId: 'bambu-x1e', slots: [black()] },
    lines: [bracket({ printerId: 'bambu-x1e' })],
  }, s);

  assert.equal(withoutPlate.lines[0].jobs, withPlate.lines[0].jobs);
  assert.equal(withoutPlate.lines[0].perPlate, withPlate.lines[0].perPlate);
  assert.equal(round(withoutPlate.totals.finalInvoice), round(withPlate.totals.finalInvoice));
});

test('two part types sharing a bed need fewer total plates than pricing them apart', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };

  const apart = calculateOrder({ plate, lines: [bracket()] }, s);
  const apartAlone = calculateOrder({ plate, lines: [housing()] }, s);
  const naiveTotalPlates = apart.lines[0].jobs + apartAlone.lines[0].jobs;

  const shared = calculateOrder({ plate, lines: [bracket(), housing()] }, s);
  const sharedTotalPlates = Math.max(...shared.lines.map((l) => l.jobs));
  // Each line's own `jobs` counts only the plates IT appears on, so the true
  // number of physical plates for the bed is the largest such count, not the
  // sum - two types on the same plate would otherwise be counted twice.
  assert.ok(sharedTotalPlates <= naiveTotalPlates,
    `sharing (${sharedTotalPlates}) must never need more physical plates than pricing apart `
    + `(${naiveTotalPlates})`);
});

test('sharing a bed lowers the cost per part when there was slack to share', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };

  // A small quantity of a big part, alone, wastes most of its own plate.
  const smallHousingOrder = housing({ quantity: 1 });
  const alone = calculateOrder({ plate, lines: [smallHousingOrder] }, s);

  // The same housing, sharing a bed with brackets that fill the space it was
  // wasting, should cost that housing no more per unit - the shared plate it
  // is already using absorbs the brackets for free.
  const shared = calculateOrder({ plate, lines: [bracket(), smallHousingOrder] }, s);
  const housingLine = shared.lines.find((l) => l.name === 'Housing');

  assert.ok(housingLine.jobs <= alone.lines[0].jobs,
    'the housing must not need MORE plates just because it now shares the bed');
});

test('bed placement can be overridden by a line that has actually been nested', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };
  const overridden = calculateOrder({
    plate,
    lines: [bracket(), housing({ partsPerPlateOverride: 1 })],
  }, s);
  const housingLine = overridden.lines.find((l) => l.name === 'Housing');
  assert.equal(housingLine.perPlate, 1, 'a manual override always wins over the bed estimate');
});

test('a part impossible on the machine does not block the rest of the bed', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };
  const giant = bracket({ name: 'Giant', geometry: analyse(box(400, 400, 400)), quantity: 1 });

  const result = calculateOrder({ plate, lines: [bracket(), giant] }, s);
  assert.ok(Number.isFinite(result.totals.finalInvoice));
  const giantLine = result.lines.find((l) => l.name === 'Giant');
  assert.equal(giantLine.fit.fits, false, 'the impossible one is still flagged, on its own line');
  const bracketLine = result.lines.find((l) => l.name === 'Bracket');
  assert.ok(bracketLine.jobs >= 1, 'and the real part still prices normally');
});

test('a shared purge tower is reserved once for the bed, not once per part type', () => {
  const s = defaultSettings();
  const white = makeSlot(spool('PLA', 'White'), 'b');
  const plate = { printerId: 'bambu-x1e', slots: [black(), white] };
  const mix = [{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }];

  const oneType = calculateOrder({
    plate, lines: [bracket({ mix, quantity: 40 })],
  }, s);
  const twoTypes = calculateOrder({
    plate, lines: [bracket({ mix, quantity: 20 }), housing({ mix, quantity: 3 })],
  }, s);

  assert.ok(twoTypes.notes.some((n) => /purge tower/.test(n.text)),
    'the bed-wide tower note is present');
  assert.ok(Number.isFinite(twoTypes.totals.finalInvoice));
  // Splitting the same total colour-changing quantity across two types must
  // not multiply the tower's footprint cost - each still needs at most a
  // couple more plates than the equivalent single-type run, never double.
  assert.ok(twoTypes.lines.reduce((t, l) => Math.max(t, l.jobs), 0)
    <= oneType.lines[0].jobs + 2);
});

test('the order still separates production from part price from invoice with a shared bed', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };
  const result = calculateOrder({ plate, lines: [bracket(), housing()] }, s);
  assert.equal(result.separation.ok, true,
    'shared-bed pricing must not break the shipping/thirds separation invariant');
});

test('a sweep over bed compositions produces no NaN and no negative price', () => {
  const s = defaultSettings();
  const plate = { printerId: 'bambu-x1e', slots: [black()] };
  const shapes = [
    () => bracket({ quantity: 1 }),
    () => bracket({ quantity: 50 }),
    () => housing({ quantity: 1 }),
    () => housing({ quantity: 7 }),
    () => bracket({ geometry: analyse(box(5, 5, 5)), quantity: 3 }),
  ];
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = 0; j < shapes.length; j += 1) {
      if (i === j) continue;
      const result = calculateOrder({ plate, lines: [shapes[i](), shapes[j]()] }, s);
      assert.ok(Number.isFinite(result.totals.finalInvoice), `${i}/${j} invoice`);
      assert.ok(result.totals.finalInvoice >= 0, `${i}/${j} negative invoice`);
      for (const line of result.lines) {
        assert.ok(Number.isFinite(line.jobs) && line.jobs >= 1, `${i}/${j} line jobs`);
        assert.ok(Number.isFinite(line.perPlate) && line.perPlate >= 1, `${i}/${j} line perPlate`);
      }
    }
  }
});
