/**
 * The purge tower, the plate it stands on, and what a second plate costs.
 *
 * These three are one chain, and the chain is the point: a tower takes bed
 * space, so fewer parts fit on a plate, so a batch needs more plates, so
 * somebody has to come back to the machine and clear it. A model that priced
 * the tower as plastic alone would miss every step after the first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSlot, normaliseMix, purgeTower, DEFAULT_TOWER,
} from '../js/filaments.js';
import { DEFAULT_PRINTERS, findPrinter } from '../js/printers.js';
import { DEFAULT_MATERIALS, findByTypeAndColour } from '../js/materials.js';
import { labourCost, DEFAULT_LABOUR_OPS, LABOUR_SCOPES, SCOPE_IDS } from '../js/labour.js';
import { partsPerPlate, analyse } from '../js/geometry.js';
import { defaultSettings, clone } from '../js/settings.js';
import { calculateOrder } from '../js/engine.js';
import { box } from './helpers/solids.js';

const M = DEFAULT_MATERIALS;
const printerOf = (id) => findPrinter(DEFAULT_PRINTERS, id);
const spool = (type, colour) => findByTypeAndColour(M, type, colour).id;

const black = () => makeSlot(spool('PLA', 'Black'), 'a');
const white = () => makeSlot(spool('PLA', 'White'), 'b');
const twoColour = () => [black(), white()];
const evenMix = [{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }];

const part = (extra = {}) => ({
  quantity: 1,
  profileId: 'function',
  materialId: spool('PLA', 'Black'),
  geometry: analyse(box(50, 50, 20)),
  hardware: [],
  ...extra,
});

/* ------------------------------------------------------- the purge tower -- */

test('a tower is needed only where the machine purges on its own', () => {
  const n = normaliseMix(evenMix, twoColour());
  const at = (id, extra = {}) => purgeTower({ ...printerOf(id), ...extra }, n, { height: 100 });

  assert.equal(at('bambu-x1e').needed, true, 'one hotend purges into a tower');
  assert.equal(at('snapmaker-u1').needed, true, 'a toolchanger wipes into one too');
  assert.equal(at('ender-3', { colourMode: 'manual' }).needed, false,
    'a person purges into a bin, not onto the plate');
  assert.equal(at('ender-3').needed, false, 'and one colour has nothing to purge');
});

test('the tower is as tall as the part and has a stated footprint', () => {
  const n = normaliseMix(evenMix, twoColour());

  const t = purgeTower(printerOf('bambu-x1e'), n, { height: 120 });
  assert.equal(t.x, DEFAULT_TOWER.x);
  assert.equal(t.y, DEFAULT_TOWER.y);
  assert.equal(t.height, 120, 'it has to reach the top of the colour changes');
  assert.equal(t.area, 900, '30 × 30 mm');
  assert.equal(t.volume, 900 * 120);

  const custom = purgeTower(printerOf('bambu-x1e'), n, { height: 50, footprint: { x: 40, y: 20 } });
  assert.equal(custom.area, 800);
});

test('one filament needs no tower, whatever the machine', () => {
  const one = normaliseMix([], [black()]);
  for (const p of DEFAULT_PRINTERS) {
    assert.equal(purgeTower(p, one, { height: 200 }).needed, false, p.id);
  }
});

/* ----------------------------------------------------------- bed space --- */

test('the tower takes bed space, so fewer parts fit on a plate', () => {
  const build = { x: 256, y: 256, z: 256 };
  const size = { x: 50, y: 50, z: 20 };
  const without = partsPerPlate(size, build);
  const withTower = partsPerPlate(size, build, { reservedArea: 900 });

  assert.ok(without > 0);
  assert.equal(withTower, without - 1, 'a 30 mm tower covers one 50 mm slot');
  assert.equal(partsPerPlate(size, build, { reservedArea: 0 }), without,
    'and reserving nothing changes nothing');
});

test('reserving more than the plate holds leaves nothing, not a negative', () => {
  assert.equal(
    partsPerPlate({ x: 50, y: 50, z: 20 }, { x: 256, y: 256, z: 256 }, { reservedArea: 1e9 }),
    0,
  );
});

/* ------------------------------------------------- plates and changeover -- */

test('per extra plate is a scope the calculator understands', () => {
  assert.ok(SCOPE_IDS.includes('extraJob'));
  const scope = LABOUR_SCOPES.find((s) => s.id === 'extraJob');
  assert.ok(scope.name && scope.hint);
});

test('the second plate costs a changeover; the first does not', () => {
  const rate = 120;
  const changeover = (jobs) => labourCost(DEFAULT_LABOUR_OPS, { quantity: 1, jobs }, { rate })
    .lines.find((l) => l.id === 'plate-changeover');

  assert.equal(changeover(1), undefined, 'one plate is one setup and no changeover');
  assert.equal(changeover(2).count, 1, 'two plates means one trip back');
  assert.equal(changeover(3).count, 2);
  assert.equal(changeover(3).minutes, 6, 'at three minutes each');
});

test('a batch that spills onto more plates costs more labour each', () => {
  const s = defaultSettings();
  const slots = [black()];
  const run = (geometry) => calculateOrder({
    plate: { printerId: 'bambu-x1e', slots },
    lines: [part({ quantity: 8, geometry })],
  }, s);

  const fits = run(analyse(box(40, 40, 20)));
  const spills = run(analyse(box(120, 120, 20)));

  assert.equal(fits.lines[0].jobs, 1, 'eight small parts fit on one plate');
  assert.ok(spills.lines[0].jobs > 1, 'eight big ones do not');
  assert.ok(
    spills.lines[0].detail.labour.minutesPerUnit > fits.lines[0].detail.labour.minutesPerUnit,
    'and the extra plates are somebody coming back to the machine',
  );
});

/* --------------------------------------------------------- the whole chain -- */

test('a purge tower can be what pushes a job onto another plate', () => {
  // The chain in one test: a tower takes bed space, so fewer parts fit, so
  // there are more plates, so there is more changeover labour.
  const s = defaultSettings();
  const geometry = analyse(box(70, 70, 20));
  const run = (slots) => calculateOrder({
    plate: { printerId: 'bambu-x1e', slots },
    lines: [part({ quantity: 9, geometry, mix: evenMix })],
  }, s);

  const oneColour = run([black()]);
  const two = run(twoColour());

  assert.equal(two.lines[0].detail.tower.needed, true);
  assert.ok(two.lines[0].perPlate < oneColour.lines[0].perPlate,
    `the tower must cost a slot: ${oneColour.lines[0].perPlate} -> ${two.lines[0].perPlate}`);
  assert.ok(two.lines[0].jobs >= oneColour.lines[0].jobs);
  assert.ok(two.lines[0].notes.some((n) => /purge tower takes/.test(n.text)),
    'and the reader is told why fewer fit');
});

test('an override of parts per plate beats the tower calculation', () => {
  const s = defaultSettings();
  const r = calculateOrder({
    plate: { printerId: 'bambu-x1e', slots: twoColour() },
    lines: [part({ quantity: 10, partsPerPlateOverride: 4, mix: evenMix })],
  }, s);
  assert.equal(r.lines[0].perPlate, 4, 'somebody who has actually nested it knows better');
  assert.equal(r.lines[0].jobs, 3);
});

test('the tower footprint is editable and moves the answer', () => {
  const s = clone(defaultSettings());
  const line = part({ quantity: 9, geometry: analyse(box(70, 70, 20)), mix: evenMix });
  const run = (settings) => calculateOrder({
    plate: { printerId: 'bambu-x1e', slots: twoColour() },
    lines: [line],
  }, settings);

  const small = run(s);
  s.estimate.assumptions.purgeTower = { x: 120, y: 120 };
  const huge = run(s);

  assert.equal(huge.lines[0].detail.tower.area, 14400);
  assert.ok(huge.lines[0].perPlate < small.lines[0].perPlate,
    'a bigger tower has to cost more of the plate');
});

test('a single-colour job has no tower and loses no bed space', () => {
  const s = defaultSettings();
  const r = calculateOrder({
    plate: { printerId: 'bambu-x1e', slots: [black()] },
    lines: [part({ quantity: 9, geometry: analyse(box(70, 70, 20)) })],
  }, s);

  assert.equal(r.lines[0].detail.tower.needed, false);
  assert.equal(r.lines[0].detail.tower.area, 0);
  assert.equal(
    r.lines[0].perPlate,
    partsPerPlate({ x: 70, y: 70, z: 20 }, printerOf('bambu-x1e').build),
    'the whole plate is available',
  );
});

test('a pause-and-change job has no tower either, and says why in the labour', () => {
  const s = defaultSettings();
  const ender = clone(s);
  ender.printers.find((p) => p.id === 'ender-3').colourMode = 'manual';

  const r = calculateOrder({
    plate: { printerId: 'ender-3', slots: twoColour() },
    lines: [part({ quantity: 5, mix: evenMix })],
  }, ender);

  assert.equal(r.lines[0].detail.tower.needed, false, 'the person purges into a bin');
  // Five parts on one plate is ONE swap, not five: the printer pauses once and
  // every part on the bed carries on in the new colour.
  assert.equal(r.lines[0].detail.changes.manualChanges, 1, 'one swap for the plate');
  assert.equal(r.lines[0].jobs, 1, 'and the five parts do share a single plate');
  const colourLabour = r.lines[0].detail.labour.lines.find((l) => l.id === 'colour-change');
  assert.ok(colourLabour, 'and a hand swap does cost labour');
  assert.equal(colourLabour.count, r.lines[0].jobs, 'charged once per plate, not per part');
});

test('an automatic change costs no labour at all', () => {
  // A tool change and an AMS purge cost machine time and plastic. Nobody is
  // standing at the machine, and billing a person for it is simply wrong.
  const s = defaultSettings();
  for (const printerId of ['bambu-x1e', 'snapmaker-u1']) {
    const r = calculateOrder({
      plate: { printerId, slots: twoColour() },
      lines: [part({ quantity: 5, mix: evenMix })],
    }, s);
    assert.equal(r.lines[0].detail.changes.manualChanges, 0, printerId);
    assert.equal(
      r.lines[0].detail.labour.lines.find((l) => l.id === 'colour-change'),
      undefined,
      `${printerId} billed a person for an automatic change`,
    );
  }
});

test('a sweep over plate counts and towers produces no NaN', () => {
  const s = defaultSettings();
  const sizes = [box(10, 10, 10), box(70, 70, 20), box(200, 200, 200), box(1, 1, 200)];
  for (const printerId of ['bambu-x1e', 'snapmaker-u1', 'ender-3']) {
    for (const mesh of sizes) {
      for (const quantity of [1, 9, 100]) {
        for (const slots of [[black()], twoColour()]) {
          const r = calculateOrder({
            plate: { printerId, slots },
            lines: [part({ quantity, geometry: analyse(mesh), mix: evenMix })],
          }, s);
          const line = r.lines[0];
          assert.ok(Number.isFinite(r.totals.finalInvoice), `${printerId} invoice`);
          assert.ok(Number.isFinite(line.perPlate) && line.perPlate >= 1, `${printerId} perPlate`);
          assert.ok(Number.isFinite(line.jobs) && line.jobs >= 1, `${printerId} jobs`);
          assert.ok(Number.isFinite(line.detail.tower.area) && line.detail.tower.area >= 0);
          assert.ok(line.detail.labour.minutes >= 0);
        }
      }
    }
  }
});
