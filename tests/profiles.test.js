import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILES, DEFAULT_FACTOR_MODEL, PUBLISHED_FACTORS, FACTOR_ORDER,
  FACTOR_LABELS, INFILL_PATTERNS, BASELINE_PROFILE_ID,
  factorsFor, factorFor, findProfile,
} from '../js/profiles.js';

const byId = (id) => DEFAULT_PROFILES.find((p) => p.id === id);
const within = (actual, expected, tolerance, what) => {
  const error = Math.abs(actual - expected) / (Math.abs(expected) || 1);
  assert.ok(error <= tolerance,
    `${what}: got ${actual.toFixed(4)}, published ${expected} (${(error * 100).toFixed(2)}% off)`);
};

test('the published totals are the product of their own breakdowns', () => {
  // If a column does not multiply out, either the table or our reading of it is
  // wrong, and everything downstream inherits the error.
  for (const kind of ['time', 'material']) {
    for (const [id, column] of Object.entries(PUBLISHED_FACTORS[kind])) {
      const product = FACTOR_ORDER.reduce((acc, name) => acc * column[name], 1);
      within(product, column.total, 0.005, `published ${kind} ${id}`);
    }
  }
});

test('the fitted model reproduces every published factor', () => {
  for (const kind of ['time', 'material']) {
    for (const [id, column] of Object.entries(PUBLISHED_FACTORS[kind])) {
      const profile = byId(id);
      assert.ok(profile, `no shipped profile ${id}`);
      const computed = factorsFor(profile.settings, DEFAULT_FACTOR_MODEL);
      for (const part of computed.parts) {
        within(part[kind], column[part.name], 0.01, `${id} ${kind} ${part.name}`);
      }
      within(computed[kind], column.total, 0.005, `${id} ${kind} total`);
    }
  }
});

test('the baseline profile has a factor of exactly 1 in both directions', () => {
  const baseline = byId(BASELINE_PROFILE_ID);
  const f = factorsFor(baseline.settings);
  assert.equal(f.time, 1);
  assert.equal(f.material, 1);
  assert.equal(f.basis, 'calibrated');
});

test('every shipped profile carries every setting the model asks about', () => {
  for (const profile of DEFAULT_PROFILES) {
    for (const name of FACTOR_ORDER) {
      assert.ok(name in profile.settings, `${profile.id} is missing ${name}`);
    }
    assert.ok(profile.blurb && profile.name, `${profile.id} needs a name and blurb`);
    assert.equal(typeof profile.version, 'number');
  }
});

test('every factor the model knows about has a label and a place in the order', () => {
  // pitfalls #15: a name one side uses and the other does not is silent.
  for (const name of Object.keys(DEFAULT_FACTOR_MODEL)) {
    assert.ok(FACTOR_ORDER.includes(name), `${name} is modelled but never shown`);
    assert.ok(FACTOR_LABELS[name], `${name} has no label`);
  }
  for (const name of FACTOR_ORDER) {
    assert.ok(DEFAULT_FACTOR_MODEL[name], `${name} is shown but not modelled`);
  }
});

test('every infill pattern offered is one the model prices', () => {
  const priced = new Set(Object.keys(DEFAULT_FACTOR_MODEL.infillPattern.values));
  for (const pattern of INFILL_PATTERNS) {
    assert.ok(priced.has(pattern.id), `pattern ${pattern.id} falls back in silence`);
  }
});

test('changing a setting actually moves the factor', () => {
  // Otherwise "all profile values must be editable" is decoration.
  const base = { ...byId('display').settings };
  const dense = factorsFor({ ...base, infill: 60 });
  assert.ok(dense.material > 2.5 && dense.material < 3.5, `got ${dense.material}`);

  const walls = factorsFor({ ...base, wallLoops: 4 });
  within(walls.time, 3.12, 0.001, 'four wall loops');
});

test('a value outside the measured range is marked extrapolated, not quietly used', () => {
  const base = byId('display').settings;
  assert.equal(factorFor('infill', { ...base, infill: 100 }).basis, 'extrapolated');
  assert.equal(factorFor('infill', { ...base, infill: 15 }).basis, 'calibrated');
  assert.equal(factorFor('wallLoops', { ...base, wallLoops: 12 }).basis, 'extrapolated');
  assert.equal(factorsFor({ ...base, layerHeight: 0.08 }).basis, 'extrapolated');
});

test('layer height follows the measurement inside the band and physics outside it', () => {
  const base = byId('display').settings;
  const at = (h) => factorFor('layerHeight', { ...base, layerHeight: h });

  // Measured points reproduce exactly.
  within(at(0.2).time, 1.0, 1e-9, '0.20 mm');
  within(at(0.15).time, 1.05, 1e-9, '0.15 mm');
  // Between them, interpolated.
  within(at(0.175).time, 1.025, 1e-9, '0.175 mm');
  // Below the measured band a thinner layer must cost materially more time, not
  // the 5% a naive extension of the measurement would give.
  assert.ok(at(0.1).time > 1.5, `0.10 mm gave ${at(0.1).time}`);
  within(at(0.1).time, 1.05 * 1.5, 1e-9, '0.10 mm');
  // A thicker layer must be faster than the baseline.
  assert.ok(at(0.3).time < 1, `0.30 mm gave ${at(0.3).time}`);
});

test('an unknown pattern or material is assumed neutral, never guessed at', () => {
  const base = byId('display').settings;
  const unknown = factorFor('infillPattern', { ...base, infillPattern: 'not-a-pattern' });
  assert.deepEqual([unknown.time, unknown.material, unknown.basis], [1, 1, 'assumed']);
});

test('findProfile falls back by name, not by position', () => {
  assert.equal(findProfile(DEFAULT_PROFILES, 'visual').id, 'visual');
  assert.equal(findProfile(DEFAULT_PROFILES, 'gone').id, BASELINE_PROFILE_ID);
});

test('no factor is ever negative, whatever is typed in', () => {
  const base = byId('display').settings;
  for (const infill of [-50, 0, 15, 100, 1000]) {
    for (const wallLoops of [0, 1, 2, 50]) {
      for (const layerHeight of [0.04, 0.1, 0.2, 0.6]) {
        const f = factorsFor({ ...base, infill, wallLoops, layerHeight });
        assert.ok(Number.isFinite(f.time) && f.time >= 0, `time ${f.time}`);
        assert.ok(Number.isFinite(f.material) && f.material >= 0, `material ${f.material}`);
      }
    }
  }
});
