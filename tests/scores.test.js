import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoresFor, SCORE_AXES } from '../js/scores.js';
import { DEFAULT_PROFILES } from '../js/profiles.js';

const byId = Object.fromEntries(DEFAULT_PROFILES.map((p) => [p.id, scoresFor(p.settings)]));

test('every score sits on the 1–5 band', () => {
  for (const p of DEFAULT_PROFILES) {
    const s = scoresFor(p.settings);
    for (const axis of SCORE_AXES) {
      assert.ok(s[axis.id] >= 1 && s[axis.id] <= 5, `${p.id}.${axis.id} = ${s[axis.id]} out of band`);
    }
  }
});

test('strength follows infill + walls + material, non-linearly', () => {
  assert.ok(byId['extra-strong'].strength > byId.strength.strength, 'extra-strong is the strongest');
  assert.ok(byId.strength.strength > byId.function.strength, 'strength beats function');
  assert.ok(byId.function.strength > byId.display.strength, 'function beats a display shape');
  // Doubling infill does NOT double strength — the walls dominate.
  const lo = scoresFor({ infill: 10, wallLoops: 3, layerHeight: 0.2, materialType: 'PLA', infillPattern: 'grid' }).strength;
  const hi = scoresFor({ infill: 20, wallLoops: 3, layerHeight: 0.2, materialType: 'PLA', infillPattern: 'grid' }).strength;
  assert.ok(hi > lo, 'more infill is stronger');
  assert.ok(hi < lo * 2, 'but not twice as strong for twice the infill');
});

test('walls give diminishing returns (moment of inertia saturates)', () => {
  // The first walls carry the most bending load; each further wall adds less, so
  // the strength gain 2→3 is larger than the gain 6→7.
  const S = (n) => scoresFor({ infill: 15, wallLoops: n, layerHeight: 0.2, materialType: 'PLA', infillPattern: 'grid' }).strength;
  const earlyGain = S(3) - S(2);
  const lateGain = S(7) - S(6);
  assert.ok(earlyGain > lateGain, `first walls add more (${earlyGain.toFixed(2)}) than later ones (${lateGain.toFixed(2)})`);
});

test('a stronger plastic raises strength for the same settings', () => {
  const base = { infill: 30, wallLoops: 4, layerHeight: 0.2, infillPattern: 'grid' };
  assert.ok(scoresFor({ ...base, materialType: 'PLA-CF' }).strength
    > scoresFor({ ...base, materialType: 'PLA' }).strength);
  assert.ok(scoresFor({ ...base, materialType: 'PLA' }).strength
    > scoresFor({ ...base, materialType: 'TPU' }).strength);
});

test('speed and cost fall as the part gets heavier and slower', () => {
  assert.ok(byId.display.speed > byId['extra-strong'].speed, 'a display shape prints faster than extra-strong');
  assert.ok(byId.display.cost > byId['extra-strong'].cost, 'a display shape is cheaper than extra-strong');
  // Fuzzy skin is slow: it should cost speed even with light infill.
  const plain = scoresFor({ infill: 15, wallLoops: 2, layerHeight: 0.2, materialType: 'PLA' }).speed;
  const fuzzy = scoresFor({ infill: 15, wallLoops: 2, layerHeight: 0.2, materialType: 'PLA', fuzzySkin: true }).speed;
  assert.ok(fuzzy < plain, 'fuzzy skin is slower');
});

test('an iterative calibration pass makes Fit the dearest profile', () => {
  // Reprinting to dial in the fit is the most expensive thing a profile carries,
  // so Fit has the lowest cost score of all the shipped profiles.
  const cheapest = Math.min(...Object.values(byId).map((s) => s.cost));
  assert.equal(byId.fit.cost, cheapest, 'Fit loses on cost');
  const base = { infill: 15, wallLoops: 2, layerHeight: 0.2, materialType: 'PLA' };
  assert.ok(scoresFor({ ...base, calibrationPass: true }).cost < scoresFor(base).cost, 'a calibration pass makes a part dearer');
});

test('precision rewards fine layers and shrinkage/calibration, and fuzzy skin hurts it', () => {
  assert.ok(byId.fit.precision >= byId.display.precision, 'the Fit profile is at least as precise as a display shape');
  const base = { infill: 15, wallLoops: 2, layerHeight: 0.2, materialType: 'PLA' };
  assert.ok(scoresFor({ ...base, shrinkage: true }).precision > scoresFor(base).precision, 'shrinkage helps');
  assert.ok(scoresFor({ ...base, shrinkage: true, calibrationPass: true }).precision
    > scoresFor({ ...base, shrinkage: true }).precision, 'a calibration reprint helps more');
  assert.ok(scoresFor({ ...base, layerHeight: 0.12 }).precision > scoresFor(base).precision, 'finer layers help');
  assert.ok(scoresFor({ ...base, fuzzySkin: true }).precision < scoresFor(base).precision, 'fuzzy skin roughens the surface, hurting precision');
  // Fit is the precision winner; Visual (fine but fuzzy) must not out-precise Function.
  assert.ok(byId.fit.precision > byId.function.precision, 'Fit is the precision winner');
  assert.ok(byId.visual.precision < byId.function.precision, 'fuzzy Visual is less precise than Function');
});

test('aesthetics rewards finish settings and penalises messy plastics', () => {
  assert.ok(byId.visual.aesthetics > byId.display.aesthetics, 'the Visual profile looks best');
  const base = { infill: 15, wallLoops: 2, layerHeight: 0.2, infillPattern: 'rectilinear' };
  assert.ok(scoresFor({ ...base, materialType: 'PLA' }).aesthetics
    > scoresFor({ ...base, materialType: 'ABS' }).aesthetics, 'ABS warps, so it scores lower');
});
