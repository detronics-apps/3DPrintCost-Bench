/**
 * Print intent profiles and the empirical factor model. Pure.
 *
 * WHAT THESE NUMBERS ARE. The factor tables in the specification are
 * *measurements this company made*, expressed as ratios against the Display
 * Only profile. They are calibration data, not physics, and the app must never
 * present them as physics (see the README's accuracy note).
 *
 * WHY THERE IS A MODEL AT ALL. Shipping the six published columns as frozen
 * constants would make "all profile values must be editable" hollow: changing
 * infill from 95% to 50% would move nothing. So the published anchors are
 * fitted to a small, explicit, editable model, and every factor a profile uses
 * is computed from the settings the profile actually carries.
 *
 * Each factor reports its `basis`:
 *   'calibrated'   - inside the range the anchors cover
 *   'extrapolated' - outside it, continued on the stated relation
 *   'assumed'      - a slot with no measurement behind it yet
 *
 * The tests assert that this model reproduces all twelve published columns to
 * within 0.5%, which is what earns the right to use it in place of the table.
 */

import { num } from './money.js';

/** The profile every factor is measured against. Its whole column is 1.00. */
export const BASELINE_PROFILE_ID = 'display';

export const INFILL_PATTERNS = [
  { id: 'rectilinear', name: 'Rectilinear' },
  { id: 'gyroid', name: 'Gyroid' },
  { id: 'grid', name: 'Grid' },
  { id: 'honeycomb', name: 'Honeycomb' },
  { id: 'lightning', name: 'Lightning' },
];

/**
 * The fitted model. Every coefficient here is editable in Expert settings.
 *
 * `infill` and `wallLoops` are straight lines through the published anchors:
 *   walls  2 -> 1.00, 3 -> 2.06, 5 -> 4.18, 7 -> 6.30   (exactly 1 + 1.06n)
 *   infill 15 -> 1.00, 30 -> 1.68, 80 -> 3.92, 95 -> 4.59 (least squares)
 *
 * `layerHeight` is anchors with interpolation, NOT a law. Two measured points
 * (0.20 and 0.15) cannot establish one, and the honest inverse relation
 * disagrees with them badly - 0.20/0.15 is 1.33, the measurement says 1.05. So
 * inside the measured band the measurement wins; outside it the app continues
 * on the inverse relation and says that it has done so.
 */
export const DEFAULT_FACTOR_MODEL = {
  infill: {
    kind: 'linear',
    from: 15,
    timePerPoint: 0.044903,
    materialPerPoint: 0.047853,
    measured: [15, 95],
    note: 'Fitted through the measured infill anchors at 15, 30, 80 and 95%.',
  },
  wallLoops: {
    kind: 'linear',
    from: 2,
    timePerPoint: 1.06,
    materialPerPoint: 1.06,
    measured: [2, 7],
    note: 'Exactly linear through the measured anchors at 2, 3, 5 and 7 loops.',
  },
  infillPattern: {
    kind: 'table',
    values: {
      rectilinear: { time: 1.0, material: 1.0 },
      gyroid: { time: 1.05, material: 0.95 },
      grid: { time: 1.0, material: 1.0 },
      honeycomb: { time: 1.05, material: 1.0 },
      lightning: { time: 0.85, material: 0.8 },
    },
    measured: ['rectilinear', 'gyroid'],
    note: 'Only rectilinear and gyroid were measured; the others are estimates.',
  },
  materialType: {
    kind: 'table',
    values: {},
    measured: [],
    note: 'No material was found to change time or material use measurably. The '
      + 'slot exists so a measurement can be recorded when one is made.',
  },
  colour: {
    kind: 'table',
    values: {},
    measured: [],
    note: 'Colour was measured as having no effect on time or material.',
  },
  shrinkage: { kind: 'flag', on: { time: 1.05, material: 1.05 }, measured: true },
  angleOptimisation: { kind: 'flag', on: { time: 1.05, material: 1.05 }, measured: true },
  ironing: { kind: 'flag', on: { time: 1.1, material: 1.0 }, measured: true },
  fuzzySkin: { kind: 'flag', on: { time: 1.35, material: 1.0 }, measured: true },
  layerHeight: {
    kind: 'anchors',
    points: [
      { h: 0.15, time: 1.05, material: 1.01 },
      { h: 0.2, time: 1.0, material: 1.0 },
    ],
    outside: 'inverse',
    note: 'Two measured heights. Outside 0.15-0.20 mm the app continues on the '
      + 'inverse-height relation (halving the layer roughly doubles the time) '
      + 'and marks the result extrapolated.',
  },
};

/** The order the breakdown is always presented in, so two screens agree. */
export const FACTOR_ORDER = [
  'infill', 'infillPattern', 'wallLoops', 'materialType', 'colour',
  'shrinkage', 'angleOptimisation', 'ironing', 'fuzzySkin', 'layerHeight',
];

export const FACTOR_LABELS = {
  infill: 'Infill density',
  infillPattern: 'Infill pattern',
  wallLoops: 'Wall loops',
  materialType: 'Material',
  colour: 'Colour',
  shrinkage: 'Shrinkage compensation',
  angleOptimisation: 'Angle / orientation optimisation',
  ironing: 'Ironing',
  fuzzySkin: 'Fuzzy skin',
  layerHeight: 'Layer height',
};

/* --------------------------------------------------------------- profiles -- */

const profile = (id, name, blurb, settings) => ({
  id, name, blurb, version: 1, builtIn: true, settings,
});

/** The six shipped profiles, with the values the specification gives. */
export const DEFAULT_PROFILES = [
  profile('extra-strong', 'Extra Strong',
    'Maximum load capacity. Slow and material-hungry: use it when the part has '
    + 'to survive, not when it has to look good.', {
      infill: 95,
      infillPattern: 'gyroid',
      wallLoops: 7,
      materialType: 'PLA-CF',
      colour: 'Dark Grey',
      shrinkage: false,
      angleOptimisation: true,
      ironing: false,
      fuzzySkin: false,
      layerHeight: 0.2,
    }),
  profile('strength', 'Strength',
    'Structural parts in ordinary PLA. Most of the strength of Extra Strong for '
    + 'a little over half the machine time.', {
      infill: 80,
      infillPattern: 'gyroid',
      wallLoops: 5,
      materialType: 'PLA',
      colour: 'Dark Grey',
      shrinkage: false,
      angleOptimisation: true,
      ironing: false,
      fuzzySkin: false,
      layerHeight: 0.2,
    }),
  profile('fit', 'Fit',
    'Dimensional accuracy first. Shrinkage compensation on, everything else left '
    + 'alone so the part measures what the model says.', {
      infill: 15,
      infillPattern: 'rectilinear',
      wallLoops: 2,
      materialType: 'PLA',
      colour: 'Dark Grey',
      shrinkage: true,
      angleOptimisation: false,
      ironing: false,
      fuzzySkin: false,
      layerHeight: 0.2,
    }),
  profile('function', 'Function',
    'The everyday working part: PETG, moderate infill, three walls. Tougher and '
    + 'more heat-tolerant than PLA without the Strength profile cost.', {
      infill: 30,
      infillPattern: 'rectilinear',
      wallLoops: 3,
      materialType: 'PETG',
      colour: 'Dark Grey',
      shrinkage: true,
      angleOptimisation: false,
      ironing: false,
      fuzzySkin: false,
      layerHeight: 0.2,
    }),
  profile('visual', 'Visual',
    'Surface finish first. Ironing and fuzzy skin cost time but almost no '
    + 'material: this profile is cheap in grams and expensive in hours.', {
      infill: 15,
      infillPattern: 'rectilinear',
      wallLoops: 2,
      materialType: 'PLA',
      colour: 'Dark Grey',
      shrinkage: false,
      angleOptimisation: true,
      ironing: true,
      fuzzySkin: true,
      layerHeight: 0.15,
    }),
  profile('display', 'Display Only',
    'The baseline every factor is measured against. Nothing enabled, nothing '
    + 'optimised: a shape to look at.', {
      infill: 15,
      infillPattern: 'rectilinear',
      wallLoops: 2,
      materialType: 'PLA',
      colour: 'Dark Grey',
      shrinkage: false,
      angleOptimisation: false,
      ironing: false,
      fuzzySkin: false,
      layerHeight: 0.2,
    }),
];

/**
 * The published table, kept verbatim so the model can be checked against it and
 * so the app can show the reader what was actually measured.
 * Source: the specification, sections 8 and 9.
 */
export const PUBLISHED_FACTORS = {
  time: {
    'extra-strong': { total: 31.88, infill: 4.59, infillPattern: 1.05, wallLoops: 6.3, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    strength: { total: 18.07, infill: 3.92, infillPattern: 1.05, wallLoops: 4.18, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    fit: { total: 1.05, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1.05, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    function: { total: 3.63, infill: 1.68, infillPattern: 1, wallLoops: 2.06, materialType: 1, colour: 1, shrinkage: 1.05, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    visual: { total: 1.64, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1.1, fuzzySkin: 1.35, layerHeight: 1.05 },
    display: { total: 1, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
  },
  material: {
    'extra-strong': { total: 30.35, infill: 4.83, infillPattern: 0.95, wallLoops: 6.3, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    strength: { total: 17.14, infill: 4.11, infillPattern: 0.95, wallLoops: 4.18, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    fit: { total: 1.05, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1.05, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    function: { total: 3.7, infill: 1.71, infillPattern: 1, wallLoops: 2.06, materialType: 1, colour: 1, shrinkage: 1.05, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
    visual: { total: 1.06, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1.05, ironing: 1, fuzzySkin: 1, layerHeight: 1.01 },
    display: { total: 1, infill: 1, infillPattern: 1, wallLoops: 1, materialType: 1, colour: 1, shrinkage: 1, angleOptimisation: 1, ironing: 1, fuzzySkin: 1, layerHeight: 1 },
  },
};

/* ----------------------------------------------------------------- model -- */

const pair = (time, material, basis) => ({ time, material, basis });

function linearFactor(spec, value) {
  const x = num(value, spec.from);
  const steps = x - spec.from;
  const inRange = x >= spec.measured[0] - 1e-9 && x <= spec.measured[1] + 1e-9;
  return pair(
    Math.max(0, 1 + steps * spec.timePerPoint),
    Math.max(0, 1 + steps * spec.materialPerPoint),
    inRange ? 'calibrated' : 'extrapolated',
  );
}

function tableFactor(spec, key) {
  const hit = spec.values[key];
  if (!hit) return pair(1, 1, 'assumed');
  return pair(
    num(hit.time, 1),
    num(hit.material, 1),
    spec.measured.includes(key) ? 'calibrated' : 'assumed',
  );
}

function flagFactor(spec, on) {
  if (!on) return pair(1, 1, 'calibrated');
  return pair(
    num(spec.on.time, 1),
    num(spec.on.material, 1),
    spec.measured ? 'calibrated' : 'assumed',
  );
}

/**
 * Layer height: interpolate between the measured anchors; outside them,
 * continue on the inverse relation from the nearest anchor and say so.
 */
function anchorFactor(spec, value) {
  const points = [...spec.points].sort((a, b) => a.h - b.h);
  const h = num(value, points[points.length - 1].h);
  if (!(h > 0)) return pair(1, 1, 'assumed');

  const lo = points[0];
  const hi = points[points.length - 1];

  if (h < lo.h) {
    // Thinner layers than anything measured: time goes as 1/h, material barely
    // moves. Anchored on the nearest measurement so the curve is continuous.
    return pair(lo.time * (lo.h / h), lo.material, 'extrapolated');
  }
  if (h > hi.h) {
    return pair(hi.time * (hi.h / h), hi.material, 'extrapolated');
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
      return pair(
        a.time + (b.time - a.time) * t,
        a.material + (b.material - a.material) * t,
        'calibrated',
      );
    }
  }
  return pair(1, 1, 'assumed');
}

/** One named factor, from the settings and the model. */
export function factorFor(name, settings, model = DEFAULT_FACTOR_MODEL) {
  const spec = model[name];
  if (!spec) return pair(1, 1, 'assumed');
  switch (spec.kind) {
    case 'linear': return linearFactor(spec, settings[name]);
    case 'table': return tableFactor(spec, settings[name]);
    case 'flag': return flagFactor(spec, Boolean(settings[name]));
    case 'anchors': return anchorFactor(spec, settings[name]);
    default: return pair(1, 1, 'assumed');
  }
}

/**
 * The whole factor set for a profile's settings.
 *
 * `total` is the PRODUCT of the parts, never a stored number. A stored total
 * that disagrees with its own breakdown is the sort of thing nobody notices
 * until a customer adds the column up.
 */
export function factorsFor(settings, model = DEFAULT_FACTOR_MODEL) {
  const parts = [];
  let time = 1;
  let material = 1;
  let anyExtrapolated = false;
  let anyAssumed = false;

  for (const name of FACTOR_ORDER) {
    const f = factorFor(name, settings, model);
    time *= f.time;
    material *= f.material;
    if (f.basis === 'extrapolated') anyExtrapolated = true;
    if (f.basis === 'assumed' && (f.time !== 1 || f.material !== 1)) anyAssumed = true;
    parts.push({ name, label: FACTOR_LABELS[name] || name, ...f });
  }

  return {
    parts,
    time,
    material,
    basis: anyExtrapolated ? 'extrapolated' : (anyAssumed ? 'assumed' : 'calibrated'),
  };
}

/** Look a profile up by id. Named fallback, never a positional one. */
export function findProfile(profiles, id) {
  return profiles.find((p) => p.id === id)
    || profiles.find((p) => p.id === BASELINE_PROFILE_ID)
    || profiles[0];
}
