/**
 * Loaded filament, the per-part mix, and what a colour change actually costs.
 *
 * The three shipped machines pay for a change in genuinely different
 * currencies, and the app must not flatten that: a tool change is seconds, a
 * purge is wasted plastic, and a manual swap is a person standing at a machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeSlot, defaultSlots, reconcileSlots, canAddSlot, normaliseMix, mixWarnings,
  materialBreakdown, mixForEstimate, primarySlot, slotsUsed, changeModel, mixWithSlotAdded,
} from '../js/filaments.js';
import {
  DEFAULT_PRINTERS, COLOUR_MODES, colourMode, slotLimit, findPrinter,
} from '../js/printers.js';
import { DEFAULT_MATERIALS, findByTypeAndColour } from '../js/materials.js';
import { defaultSettings } from '../js/settings.js';
import { calculateOrder } from '../js/engine.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

const M = DEFAULT_MATERIALS;
const printerOf = (id) => findPrinter(DEFAULT_PRINTERS, id);
const spool = (type, colour) => findByTypeAndColour(M, type, colour).id;

/* --------------------------------------------------------- the capability -- */

test('each shipped machine has the capability it really has', () => {
  assert.equal(colourMode(printerOf('ender-3')).id, 'single');
  assert.equal(colourMode(printerOf('bambu-x1e')).id, 'multicolour');
  assert.equal(colourMode(printerOf('snapmaker-u1')).id, 'multimaterial');
});

test('what may vary follows from the machine, not from a preference', () => {
  const ender = colourMode(printerOf('ender-3'));
  const bambu = colourMode(printerOf('bambu-x1e'));
  const snap = colourMode(printerOf('snapmaker-u1'));

  assert.equal(ender.coloursVary, false);
  assert.equal(bambu.coloursVary, true);
  assert.equal(bambu.materialsVary, false, 'one hotend has one temperature');
  assert.equal(snap.materialsVary, true, 'independent heads have their own');

  assert.equal(slotLimit(printerOf('ender-3')), 1);
  assert.equal(slotLimit(printerOf('bambu-x1e')), 4);
  assert.equal(slotLimit(printerOf('snapmaker-u1')), 4);
});

test('an unknown mode falls back to the conservative one, by name', () => {
  assert.equal(colourMode({ colourMode: 'quad-extruder-hyperdrive' }).id, 'single');
  assert.equal(colourMode(undefined).id, 'single');
  assert.equal(slotLimit({ colourMode: 'nonsense', colourSlots: 8 }), 1);
});

test('there are four capabilities, in order of what they can do', () => {
  assert.deepEqual(COLOUR_MODES.map((m) => m.id),
    ['single', 'manual', 'multicolour', 'multimaterial']);

  const by = (id) => COLOUR_MODES.find((m) => m.id === id);
  assert.equal(by('single').coloursVary, false);
  assert.equal(by('manual').coloursVary, true);
  assert.equal(by('manual').manual, true, 'only this one costs a person');
  assert.equal(by('multicolour').manual, false);
  assert.equal(by('multimaterial').manual, false);
  assert.equal(by('manual').materialsVary, true, 'anything can be put in by hand');
  assert.equal(by('multicolour').materialsVary, false, 'one hotend, one temperature');
});

test('every mode a printer can carry is one the app honours', () => {
  const known = new Set(COLOUR_MODES.map((m) => m.id));
  for (const p of DEFAULT_PRINTERS) {
    assert.ok(known.has(p.colourMode), `${p.id} has mode "${p.colourMode}"`);
  }
  for (const m of COLOUR_MODES) assert.ok(m.name && m.hint, `${m.id} needs a name and a hint`);
});

/* ---------------------------------------------------------------- slots -- */

test('a single-filament machine is held to one spool, and says so', () => {
  const three = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'Red'), 'b'), makeSlot(spool('PLA', 'Blue'), 'c')];
  const r = reconcileSlots(three, printerOf('ender-3'), M);

  assert.equal(r.slots.length, 1);
  assert.equal(r.slots[0].id, 'a', 'it keeps the first, not an arbitrary one');
  assert.ok(r.notes.some((n) => /holds 1 spool/.test(n.text)), 'and it must not drop them in silence');
  assert.equal(canAddSlot(r.slots, printerOf('ender-3')), false);
});

test('a multi-colour machine takes four colours of one plastic', () => {
  const four = ['Black', 'Red', 'Blue', 'White'].map((c, i) => makeSlot(spool('PLA', c), `s${i}`));
  const r = reconcileSlots(four, printerOf('bambu-x1e'), M);

  assert.equal(r.slots.length, 4);
  assert.deepEqual(r.notes, [], 'four colours of one plastic is exactly what it does');
  assert.equal(canAddSlot(r.slots, printerOf('bambu-x1e')), false, 'and a fifth does not fit');
});

test('a multi-colour machine will not hold two different plastics', () => {
  // One hotend has one temperature. This is the bug the user reported from the
  // other side: the app must allow different MATERIALS only where the machine
  // really can.
  const mixed = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PETG', 'Red'), 'b')];
  const r = reconcileSlots(mixed, printerOf('bambu-x1e'), M);

  const types = r.slots.map((s) => M.find((m) => m.id === s.materialId).type);
  assert.deepEqual(types, ['PLA', 'PLA'], 'the stray plastic is brought into line');
  assert.ok(r.notes.some((n) => /same plastic/.test(n.text)), 'and the reader is told');

  // The colour is preserved where it can be: PETG Red becomes PLA Red.
  assert.equal(M.find((m) => m.id === r.slots[1].materialId).colour, 'Red');
});

test('a multi-material machine holds different plastics happily', () => {
  const mixed = [
    makeSlot(spool('PLA', 'Black'), 'a'),
    makeSlot(spool('PETG', 'White'), 'b'),
    makeSlot(spool('TPU', 'Red'), 'c'),
  ];
  const r = reconcileSlots(mixed, printerOf('snapmaker-u1'), M);

  assert.equal(r.slots.length, 3);
  assert.deepEqual(r.notes, [], 'this is exactly what independent tool heads are for');
  const types = r.slots.map((s) => M.find((m) => m.id === s.materialId).type);
  assert.deepEqual(types, ['PLA', 'PETG', 'TPU']);
});

test('an empty slot list becomes one slot rather than nothing', () => {
  const r = reconcileSlots([], printerOf('bambu-x1e'), M);
  assert.equal(r.slots.length, 1);
  assert.equal(defaultSlots(printerOf('ender-3'), 'pla-white')[0].materialId, 'pla-white');
});

/* ------------------------------------------------------------------ mix -- */

const twoSlots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];

test('a mix that adds to 100 is used as typed', () => {
  const n = normaliseMix([{ slotId: 'a', percent: 62 }, { slotId: 'b', percent: 38 }], twoSlots);
  close(n.entries[0].fraction, 0.62, 1e-12, 'a');
  close(n.entries[1].fraction, 0.38, 1e-12, 'b');
  assert.equal(n.scaled, false);
  assert.deepEqual(mixWarnings(n), []);
});

test('a mix that does not add to 100 is scaled, and the reader is told', () => {
  // Not a modelling choice: a split that does not add up is a typo, and pricing
  // 87% of a part in silence is the worst of the available answers.
  const n = normaliseMix([{ slotId: 'a', percent: 60 }, { slotId: 'b', percent: 27 }], twoSlots);
  close(n.entries[0].fraction + n.entries[1].fraction, 1, 1e-12, 'the shares still add to one');
  close(n.entries[0].fraction, 60 / 87, 1e-12, 'in the proportion that was typed');
  assert.equal(n.scaled, true);
  assert.equal(n.typed, 87);
  assert.ok(mixWarnings(n, { partName: 'Bracket' })[0].text.includes('87.0%'));
});

test('an empty mix is an even split across what is loaded', () => {
  // Somebody who has just loaded a second colour has said they intend to use
  // it. Defaulting to 100% of the first meant loading a spool changed nothing
  // on screen, which reads as the control being broken.
  const n = normaliseMix([], twoSlots);
  close(n.entries[0].fraction, 0.5, 1e-12, 'first slot');
  close(n.entries[1].fraction, 0.5, 1e-12, 'second slot');
  assert.equal(slotsUsed(n), 2);

  // With one spool an even split is 100%, so nothing that worked before moves.
  const one = normaliseMix([], [twoSlots[0]]);
  close(one.entries[0].fraction, 1, 1e-12, 'a single spool is still the whole part');
});

test('a mix pointing at a spool that is gone drops it and says so', () => {
  const n = normaliseMix(
    [{ slotId: 'a', percent: 50 }, { slotId: 'gone', percent: 50 }],
    twoSlots,
  );
  assert.equal(n.dropped, 1);
  close(n.entries[0].fraction, 1, 1e-12, 'what is left takes the whole part');
  close(n.entries[1].fraction, 0, 1e-12, 'and a slot nobody mentioned stays at nothing');
  assert.ok(mixWarnings(n).some((w) => /no longer loaded/.test(w.text)));
});

test('loading a spool seeds it a share, even when a mix was already typed', () => {
  // Without this, loading a spool did nothing whenever a mix had ever been
  // typed: the new one sat at 0% and the price did not move, which reads as a
  // broken button.
  const typed = [{ slotId: 'a', percent: 70 }, { slotId: 'b', percent: 30 }];
  const next = mixWithSlotAdded(typed, twoSlots, 'c');

  close(next.reduce((t, m) => t + m.percent, 0), 100, 1e-9, 'it still adds to 100');
  close(next[2].percent, 100 / 3, 1e-9, 'the new spool takes an even share');
  close(next[0].percent / next[1].percent, 70 / 30, 1e-9,
    'and the shares already typed keep their proportion to each other');

  const n = normaliseMix(next, [...twoSlots, makeSlot(spool('PLA', 'Red'), 'c')]);
  assert.equal(slotsUsed(n), 3);
});

test('loading a second spool changes the price, without touching the mix', () => {
  // The bug this covers: adding a colour did nothing at all, because the empty
  // mix gave the whole part to slot one and the second was never used.
  const s = defaultSettings();
  const one = [makeSlot(spool('PLA', 'Black'), 'a')];
  const two = [...one, makeSlot(spool('PLA', 'White'), 'b')];

  const before = calculateOrder({ plate: { printerId: 'bambu-x1e', slots: one }, lines: [part()] }, s);
  const after = calculateOrder({ plate: { printerId: 'bambu-x1e', slots: two }, lines: [part()] }, s);

  assert.equal(before.lines[0].detail.colours, 1);
  assert.equal(after.lines[0].detail.colours, 2, 'both loaded spools are used');
  assert.ok(after.totals.costToCompany > before.totals.costToCompany,
    'and the purge that costs is real');
});

test('a mix of all zeroes falls back rather than dividing by nothing', () => {
  const n = normaliseMix([{ slotId: 'a', percent: 0 }, { slotId: 'b', percent: 0 }], twoSlots);
  close(n.entries[0].fraction + n.entries[1].fraction, 1, 1e-12, 'the shares still add to one');
  for (const e of n.entries) assert.ok(Number.isFinite(e.fraction));
  assert.deepEqual(normaliseMix([], []).entries, [], 'and no slots is not a division either');
});

/* ------------------------------------------------------------ the split -- */

test('the split is by volume and only then converted to grams', () => {
  // Half the volume in PLA and half in PC is NOT half the weight each: 1.24
  // against 1.20. Splitting grams instead of volume is a quiet error nobody
  // ever finds.
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PETG', 'Black'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }], slots);
  const b = materialBreakdown(20000, slots, n, M, 'ZA');

  close(b.lines[0].volume, 10000, 1e-9, 'half the volume');
  close(b.lines[1].volume, 10000, 1e-9, 'half the volume');
  close(b.lines[0].grams, 12.4, 1e-9, 'PLA at 1.24 g/cm³');
  close(b.lines[1].grams, 12.7, 1e-9, 'PETG at 1.27 g/cm³');
  assert.notEqual(b.lines[0].grams, b.lines[1].grams, 'equal volumes are not equal weights');
  close(b.grams, 25.1, 1e-9, 'total');
});

test('each filament is costed at its own price, not an average', () => {
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PA-CF', 'Black'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 90 }, { slotId: 'b', percent: 10 }], slots);
  const b = materialBreakdown(100000, slots, n, M, 'ZA');

  close(b.lines[0].perGram, 0.35, 1e-12, 'PLA per gram');
  close(b.lines[1].perGram, 1.40, 1e-12, 'PA-CF per gram');
  close(b.cost, b.lines[0].cost + b.lines[1].cost, 1e-12, 'the total is the sum of the parts');
  assert.ok(b.lines[1].cost > 0 && b.lines[1].grams < b.lines[0].grams,
    'a tenth of the volume in the dear stuff still costs real money');
});

test('a filament with no price is reported rather than costed at zero', () => {
  const orphan = { ...M.find((m) => m.id === 'pla-white'), id: 'orphan', prices: {} };
  const slots = [makeSlot('orphan', 'a')];
  const b = materialBreakdown(10000, slots, normaliseMix([], slots), [...M, orphan], 'ZA');
  assert.equal(b.missingPrice, true);
  assert.equal(b.lines[0].perGram, null);
});

test('supports print in whichever filament does most of the part', () => {
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PETG', 'White'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 20 }, { slotId: 'b', percent: 80 }], slots);
  assert.equal(primarySlot(slots, n, M).type, 'PETG');
  assert.equal(mixForEstimate(slots, n, M).length, 2);
});

/* ------------------------------------------------------------- changes -- */

test('an AMS purges every layer that changes; a toolchanger primes once', () => {
  // The two machines waste plastic in genuinely different amounts. One hotend
  // has to be emptied of the last colour on EVERY layer that changes, so the
  // waste scales with layers. A toolchanger's heads each keep their own
  // filament loaded and hot: they prime once at the start and a change after
  // that costs a tool swap and no plastic at all.
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }], slots);
  const opts = {
    layers: 100, interleave: 0.15, purgePerChangeMm3: 800, primePerSpoolMm3: 2500,
  };

  const bambu = changeModel(printerOf('bambu-x1e'), n, opts);
  assert.equal(bambu.changes, 15, '15 of 100 layers have a transition');
  assert.equal(bambu.purgeEvents, 15, 'and each one purges');
  assert.equal(bambu.purgeVolume, 12000, '15 flushes at 800 mm³');

  const snap = changeModel(printerOf('snapmaker-u1'), n, opts);
  assert.equal(snap.changes, 15, 'the same number of changes...');
  assert.equal(snap.purgeEvents, 2, '...but only two primes, one per head');
  assert.equal(snap.purgeVolume, 5000, 'two heads at 2500 mm³, once, at the start');
  assert.ok(snap.purgeVolume < bambu.purgeVolume / 2,
    'a toolchanger wastes far less on the same job');
});

test('the AMS purge grows with height; the toolchanger prime does not', () => {
  // This is the whole point of the distinction: on a tall multi-colour model an
  // AMS can waste more plastic than the part weighs, and a toolchanger cannot.
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }], slots);
  const at = (printerId, layers) => changeModel(printerOf(printerId), n,
    { layers, interleave: 0.15, purgePerChangeMm3: 800, primePerSpoolMm3: 2500 }).purgeVolume;

  assert.equal(at('bambu-x1e', 100), 12000);
  assert.equal(at('bambu-x1e', 1000), 120000, 'ten times as tall, ten times the waste');
  assert.equal(at('snapmaker-u1', 100), 5000);
  assert.equal(at('snapmaker-u1', 1000), 5000, 'height changes nothing — it primes once');
});

test('one colour only means no change is possible at all', () => {
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }], slots);
  const r = changeModel(printerOf('ender-3'), n, { layers: 100, quantity: 10 });

  assert.equal(r.changes, 0);
  assert.equal(r.manualChanges, 0);
  // And the slot list is held to one, so the mix above cannot arise in the app.
  assert.equal(reconcileSlots(slots, printerOf('ender-3'), M).slots.length, 1);
});

test('pause-and-change charges a person once per plate, not once per part', () => {
  // The change happens once for the whole bed: the printer pauses, the colour
  // is swapped, and every part on the plate carries on in it. So the model is
  // per plate and does not scale with quantity - that scaling is the engine's
  // job, by the number of PLATES, once it knows how many parts fit on one.
  const ender = { ...printerOf('ender-3'), colourMode: 'manual' };
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const n = normaliseMix([{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }], slots);

  assert.equal(changeModel(ender, n, { layers: 100 }).manualChanges, 1,
    'two colours is one swap on the plate');
  assert.equal(changeModel(ender, n, { layers: 1000 }).manualChanges, 1,
    'a taller part is not more swaps — it is the same one swap');
  const three = ['Black', 'White', 'Red'].map((c, i) => makeSlot(spool('PLA', c), `s${i}`));
  const n3 = normaliseMix(three.map((s) => ({ slotId: s.id, percent: 100 / 3 })), three);
  assert.equal(changeModel(ender, n3, { layers: 100 }).manualChanges, 2,
    'three colours is two swaps on the plate');
  assert.ok(/per plate/.test(changeModel(ender, n, { layers: 100 }).basis));
});

test('pause-and-change lifts the one-spool limit, up to what somebody will do', () => {
  const ender = { ...printerOf('ender-3'), colourMode: 'manual' };
  assert.equal(slotLimit(printerOf('ender-3')), 1, 'single colour holds it to one');
  assert.equal(slotLimit(ender), ender.maxColours,
    'swapping by hand is limited by patience, not by what is loaded at once');

  const three = ['Black', 'White', 'Red'].map((c, i) => makeSlot(spool('PLA', c), `s${i}`));
  const r = reconcileSlots(three, ender, M);
  assert.equal(r.slots.length, 3, 'three colours by hand is allowed');
  assert.deepEqual(r.notes, []);
});

test('swapping between different plastics by hand is allowed, and warned about', () => {
  // Physically it works — the temperature can be changed at the pause. The
  // layer where they meet is the weakest in the part, and saying so is the
  // difference between a tool and a liability.
  const ender = { ...printerOf('ender-3'), colourMode: 'manual' };
  const mixed = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PETG', 'White'), 'b')];
  const r = reconcileSlots(mixed, ender, M);

  const types = r.slots.map((s) => M.find((m) => m.id === s.materialId).type);
  assert.deepEqual(types, ['PLA', 'PETG'], 'it is not corrected away');
  assert.ok(r.notes.some((n) => /weakest/.test(n.text)), 'but the reader is warned');
});

test('one filament means no changes and no purge, on any machine', () => {
  const slots = [makeSlot(spool('PLA', 'Black'), 'a')];
  const n = normaliseMix([], slots);
  for (const p of [...DEFAULT_PRINTERS, { ...printerOf('ender-3'), colourMode: 'manual' }]) {
    const r = changeModel(p, n, { layers: 500, quantity: 50 });
    assert.equal(r.changes, 0, p.id);
    assert.equal(r.purgeEvents, 0, p.id);
    assert.equal(r.purgeVolume, 0, p.id);
  }
});

test('the purge reaches the quoted weight, and differs by machine', () => {
  const s = defaultSettings();
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const mix = [{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }];
  const tall = { ...part({ mix }), geometry: analyse(box(40, 40, 200)) };

  const bambu = calculateOrder({ plate: { printerId: 'bambu-x1e', slots }, lines: [tall] }, s);
  const snap = calculateOrder({ plate: { printerId: 'snapmaker-u1', slots }, lines: [tall] }, s);

  const purgeOf = (r) => r.lines[0].estimate.levels[r.lines[0].estimate.method].purgeG;
  assert.ok(purgeOf(bambu) > purgeOf(snap) * 20,
    `a tall two-colour part purges far more on an AMS: ${purgeOf(bambu)} vs ${purgeOf(snap)}`);
  assert.ok(bambu.lines[0].estimate.grams > snap.lines[0].estimate.grams,
    'and that plastic is in the quoted weight');
});

/* --------------------------------------------------------- through the app -- */

const part = (extra = {}) => ({
  quantity: 1,
  profileId: 'function',
  materialId: spool('PLA', 'Black'),
  geometry: analyse(box(50, 50, 20)),
  hardware: [],
  ...extra,
});

test('a two-colour part costs more than a one-colour part on the same machine', () => {
  const s = defaultSettings();
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];

  const one = calculateOrder({ lines: [part({ printerId: 'bambu-x1e' })] }, s);
  const two = calculateOrder({
    plate: { printerId: 'bambu-x1e', slots },
    lines: [part({ mix: [{ slotId: 'a', percent: 70 }, { slotId: 'b', percent: 30 }] })],
  }, s);

  assert.equal(two.lines[0].detail.colours, 2);
  assert.ok(two.lines[0].ctc > one.lines[0].ctc,
    'the purge is real plastic and the changes are real time');
});

test('the same two colours on the Ender cost far more, because a person does it', () => {
  const s = defaultSettings();
  const slotsA = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PLA', 'White'), 'b')];
  const mix = [{ slotId: 'a', percent: 70 }, { slotId: 'b', percent: 30 }];

  const bambu = calculateOrder({
    plate: { printerId: 'bambu-x1e', slots: slotsA },
    lines: [part({ mix, quantity: 10 })],
  }, s);
  const ender = calculateOrder({
    plate: { printerId: 'ender-3', slots: slotsA },
    lines: [part({ mix, quantity: 10 })],
  }, s);

  // The Ender can only hold one spool, so the second is dropped and the app
  // says so rather than pretending it printed two colours.
  assert.equal(ender.lines[0].detail.slots.length, 1);
  assert.ok(ender.lines[0].notes.some((n) => /holds 1 spool/.test(n.text)));
  assert.ok(Number.isFinite(bambu.totals.finalInvoice));
});

test('a part printed half in PLA and half in nylon is priced as both', () => {
  const s = defaultSettings();
  const slots = [makeSlot(spool('PLA', 'Black'), 'a'), makeSlot(spool('PA-CF', 'Black'), 'b')];
  const result = calculateOrder({
    plate: { printerId: 'snapmaker-u1', slots },
    lines: [part({ mix: [{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }] })],
  }, s);

  const line = result.lines[0];
  assert.equal(line.filaments.length, 2);
  assert.ok(line.filaments[1].cost > line.filaments[0].cost * 3,
    'filled nylon is four times the price of PLA and that must show');

  const plaOnly = calculateOrder({
    plate: { printerId: 'snapmaker-u1', slots: [slots[0]] },
    lines: [part()],
  }, s);
  assert.ok(line.production.material > plaOnly.lines[0].production.material,
    'half in nylon costs more than all in PLA');
});

test('a line with no slots at all still prices, exactly as it used to', () => {
  // Everything written before loaded filament existed passes a single
  // materialId. That must keep working unchanged.
  const s = defaultSettings();
  const before = calculateOrder({ lines: [part({ printerId: 'bambu-x1e' })] }, s);
  assert.ok(before.totals.finalInvoice > 0);
  assert.equal(before.lines[0].detail.slots.length, 1);
  assert.equal(before.lines[0].detail.colours, 1);
  assert.equal(before.lines[0].filaments.length, 1);
});

test('a sweep over every machine and mix produces no NaN', () => {
  const s = defaultSettings();
  const slots = [
    makeSlot(spool('PLA', 'Black'), 'a'),
    makeSlot(spool('PETG', 'White'), 'b'),
    makeSlot(spool('TPU', 'Red'), 'c'),
  ];
  const mixes = [
    null,
    [],
    [{ slotId: 'a', percent: 100 }],
    [{ slotId: 'a', percent: 50 }, { slotId: 'b', percent: 50 }],
    [{ slotId: 'a', percent: 33 }, { slotId: 'b', percent: 33 }, { slotId: 'c', percent: 33 }],
    [{ slotId: 'a', percent: 0 }, { slotId: 'b', percent: 0 }],
    [{ slotId: 'gone', percent: 100 }],
    [{ slotId: 'a', percent: -50 }, { slotId: 'b', percent: 200 }],
  ];

  for (const p of DEFAULT_PRINTERS) {
    for (const mix of mixes) {
      for (const quantity of [1, 25]) {
        const r = calculateOrder({
          plate: { printerId: p.id, slots },
          lines: [part({ mix, quantity })],
        }, s);
        assert.ok(Number.isFinite(r.totals.finalInvoice),
          `${p.id} / ${JSON.stringify(mix)} gave a non-finite invoice`);
        assert.ok(r.totals.costToCompany >= 0, `${p.id} gave a negative cost`);
        assert.ok(r.lines[0].estimate.grams >= 0);
        for (const f of r.lines[0].filaments) {
          assert.ok(Number.isFinite(f.grams) && f.grams >= 0, `${p.id} filament grams`);
        }
      }
    }
  }
});
