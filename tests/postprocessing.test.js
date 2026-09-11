/**
 * The configurable post-processing engine: the three pricing bases, hardware
 * gating, per-component vs whole-part choices, and migration from the old
 * fixed resin/nfc shape (with support/deburr carried over from labour).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POST_OPS, postProcessing, topAreaCm2, normalizePostSelection,
  entryPostOps, partHasPostProcessing, migratePostProcessing,
} from '../js/postprocessing.js';

const ops = () => DEFAULT_POST_OPS.map((o) => ({ ...o, gate: { ...o.gate } }));

const CATALOGUE = [
  { id: 'nfc-tag', name: 'NFC tag', category: 'Electronics', nfc: true, stage: 'during', insertMinutes: 3 },
  { id: 'insert-m3', name: 'M3 insert', category: 'Fastener', stage: 'after', insertMinutes: 4 },
  { id: 'usb', name: 'USB module', category: 'Electronics', stage: 'after', insertMinutes: 10 },
  { id: 'magnet', name: 'Magnet', category: 'Magnet', stage: 'during', insertMinutes: 1 },
];

/* -------------------------------------------------------------- area ------ */

test('top area is the plan-view footprint in cm²', () => {
  assert.equal(topAreaCm2({ x: 50, y: 40, z: 10 }), 20); // 2000 mm² → 20 cm²
});

/* ------------------------------------------------------- perPart basis ---- */

test('a perPart operation charges a flat labour time when chosen', () => {
  const pp = postProcessing({
    ops: ops(), selected: { 'remove-support': true }, rate: 120,
  });
  assert.equal(pp.labourMinutes, 3);
  assert.ok(Math.abs(pp.cost - (3 / 60) * 120) < 1e-9); // R6
  assert.equal(pp.applies, true);
});

test('nothing is charged for an operation the part did not choose', () => {
  const pp = postProcessing({ ops: ops(), selected: {}, rate: 120 });
  assert.equal(pp.applies, false);
  assert.equal(pp.cost, 0);
});

/* ------------------------------------------------------- perArea basis ---- */

test('a perArea operation scales labour, consumable and grams with top area', () => {
  const pp = postProcessing({
    ops: ops(), selected: { 'resin-coat': true }, areaCm2: 20, rate: 120,
  });
  assert.equal(pp.labourMinutes, 10); // 0.5 min/cm² × 20
  assert.ok(Math.abs(pp.materialGrams - 0.088 * 20) < 1e-9); // 0.088 g/cm² (measured) × 20
  assert.equal(pp.stationMinutes, 15); // curing, once
});

test('a perArea operation with no area does not apply', () => {
  const pp = postProcessing({
    ops: ops(), selected: { 'resin-coat': true }, areaCm2: 0, rate: 120,
  });
  assert.equal(pp.applies, false);
});

/* ------------------------------------------------------- perUnit basis ---- */

test('NFC coding is gated on an NFC component and counts every tag', () => {
  const withTag = postProcessing({
    ops: ops(), selected: { 'nfc-coding': true }, rate: 60,
    hardware: [{ hardwareId: 'nfc-tag', qty: 3 }], catalogue: CATALOGUE,
  });
  assert.equal(withTag.labourMinutes, 6); // 2 min/tag × 3
  const noTag = postProcessing({
    ops: ops(), selected: { 'nfc-coding': true }, rate: 60,
    hardware: [{ hardwareId: 'magnet', qty: 3 }], catalogue: CATALOGUE,
  });
  assert.equal(noTag.applies, false, 'no NFC component, so the option does not apply');
});

/* ------------------------------------------------- per-component + fit ---- */

test('fit is per after-print component and takes each component\'s own time', () => {
  const pp = postProcessing({
    ops: ops(), selected: {}, rate: 60,
    hardware: [
      { hardwareId: 'insert-m3', qty: 2, ops: { fit: true } }, // fitted
      { hardwareId: 'usb', qty: 1 }, // shipped loose
    ],
    catalogue: CATALOGUE,
  });
  assert.equal(pp.labourMinutes, 8, '2 inserts × 4 min each; the USB was not ticked');
});

test('a during-print component never offers fit', () => {
  const pp = postProcessing({
    ops: ops(), selected: {}, rate: 60,
    hardware: [{ hardwareId: 'nfc-tag', qty: 1, ops: { fit: true } }],
    catalogue: CATALOGUE,
  });
  assert.equal(pp.applies, false, 'fit gates on stage:after, and the tag is during-print');
});

/* ---------------------------------------------------------- gating -------- */

test('a category gate offers the op only when that category is present', () => {
  const list = [...ops(), {
    id: 'polish-metal', name: 'Polish', basis: 'perPart', minutes: 5,
    gate: { kind: 'category', category: 'Fastener' }, perComponent: false,
  }];
  const on = postProcessing({
    ops: list, selected: { 'polish-metal': true }, rate: 60,
    hardware: [{ hardwareId: 'insert-m3', qty: 1 }], catalogue: CATALOGUE,
  });
  assert.equal(on.labourMinutes, 5);
  const off = postProcessing({
    ops: list, selected: { 'polish-metal': true }, rate: 60,
    hardware: [{ hardwareId: 'magnet', qty: 1 }], catalogue: CATALOGUE,
  });
  assert.equal(off.applies, false, 'no Fastener present');
});

/* ---------------------------------------------------- normalisation ------- */

test('legacy per-part booleans read as operation selections', () => {
  const sel = normalizePostSelection({ needsResin: true, needsSupport: true, nfcCode: false });
  assert.equal(sel['resin-coat'], true);
  assert.equal(sel['remove-support'], true);
  assert.equal(sel['nfc-coding'], undefined);
});

test('a legacy fit flag on a component reads as an op choice', () => {
  assert.equal(entryPostOps({ fit: true }).fit, true);
  assert.equal(entryPostOps({ ops: { fit: true } }).fit, true);
  assert.deepEqual(entryPostOps({}), {});
});

test('partHasPostProcessing sees both whole-part and per-component choices', () => {
  assert.equal(partHasPostProcessing({ needsResin: true }), true);
  assert.equal(partHasPostProcessing({ hardware: [{ hardwareId: 'x', ops: { fit: true } }] }), true);
  assert.equal(partHasPostProcessing({ hardware: [{ hardwareId: 'x' }] }), false);
});

/* ---------------------------------------------------- migration ----------- */

test('migration turns the old resin/nfc shape into the operation list', () => {
  const migrated = migratePostProcessing(
    { resin: { minutesPerCm2: 0.8, gramsPerCm2: 3, curingMinutes: 20 }, nfc: { codingMinutes: 4 } },
    { supportMinutes: 3, deburrMinutes: 2 },
  );
  const byId = Object.fromEntries(migrated.ops.map((o) => [o.id, o]));
  assert.equal(byId['resin-coat'].minutes, 0.8);
  assert.equal(byId['resin-coat'].materialGrams, 3);
  assert.equal(byId['resin-coat'].stationMinutes, 20);
  assert.equal(byId['nfc-coding'].minutes, 4);
  assert.equal(byId['remove-support'].minutes, 3);
  assert.equal(byId['deburring'].minutes, 2);
});

test('migration leaves an already-converted list alone but adds new defaults', () => {
  const existing = { ops: [{ id: 'resin-coat', name: 'Resin', basis: 'perArea', minutes: 1, gate: { kind: 'always' } }] };
  const migrated = migratePostProcessing(existing);
  assert.equal(migrated.ops.find((o) => o.id === 'resin-coat').minutes, 1, 'kept');
  assert.ok(migrated.ops.some((o) => o.id === 'fit'), 'a missing default is appended');
});
