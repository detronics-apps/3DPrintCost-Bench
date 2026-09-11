/**
 * Print-intent scores. Pure.
 *
 * A profile is a preset of print SETTINGS that delivers an INTENT — "strong",
 * "pretty", "accurate" — without the customer needing to know which variables
 * get them there. These five scores are the readout of that intent: they are
 * CALCULATED from the settings, never hand-typed, so they can never disagree
 * with what the profile actually does. The company can retune every coefficient
 * here for its own machines and materials.
 *
 * Higher is always better for the customer (Cost 5 = cheapest, Speed 5 =
 * fastest). Each score is a 1–5 band over a raw index.
 *
 * WHY STRENGTH IS NOT A MULTIPLIER. Doubling infill does not double strength,
 * and a wall is worth far more than the same plastic in the middle: strength is
 * bending stiffness, which goes with the SECOND MOMENT OF AREA, and material on
 * the outside of the section carries the load. So strength is computed from the
 * moment of inertia of the wall stack around a nominal section, plus a much
 * smaller contribution from the infilled core — not from a density factor.
 */

import { num } from './money.js';

export const SCORE_AXES = [
  { id: 'speed', name: 'Speed' },
  { id: 'cost', name: 'Cost' },
  { id: 'strength', name: 'Strength' },
  { id: 'precision', name: 'Precision' },
  { id: 'aesthetics', name: 'Aesthetics' },
];

/**
 * Every coefficient the scores use, in one editable place. Material factors are
 * dimensionless multipliers around 1.0 (research-informed defaults the company
 * can retune): the strength of the plastic, and how cleanly it prints.
 */
export const DEFAULT_SCORE_MODEL = {
  // Nominal cross-section (mm) the wall moment of inertia is taken around. It is
  // a reference size for the intent, not the actual part — the part's real
  // geometry drives the price, not this readout.
  section: 40,
  nozzle: 0.4,
  lineWidthRatio: 1.05,

  // Relative tensile/flexural strength of each plastic, and how cleanly it
  // prints (warping, stringing, surface). 1.0 = plain PLA.
  materialStrength: {
    PLA: 1.0, 'PLA-CF': 1.3, PETG: 1.05, ABS: 1.1, ASA: 1.1, TPU: 0.55, 'PA-CF': 1.35, PC: 1.25,
  },
  materialAesthetic: {
    PLA: 1.0, 'PLA-CF': 0.9, PETG: 0.85, ABS: 0.75, ASA: 0.9, TPU: 0.85, 'PA-CF': 0.9, PC: 0.9,
  },
  // How isotropically each infill pattern carries load (gyroid is strong in
  // every direction; lightning is a support scaffold, not structure).
  patternStrength: {
    rectilinear: 1.0, grid: 1.0, honeycomb: 1.05, gyroid: 1.1, lightning: 0.7,
  },

  strength: { lo: 0.28, hi: 1.15 },
  // Speed: a base cost plus the plastic fraction, multiplied by the time-adders
  // (thinner layers, ironing, and fuzzy skin — which is slow — and adaptive
  // layers). The score is the inverse: faster = higher.
  speed: {
    base: 0.3, layerRef: 0.2,
    ironing: 0.1, fuzzySkin: 0.35, adaptiveLayers: 0.15,
    lo: 1.0, hi: 2.0,
  },
  cost: { fillWeight: 0.6, timeWeight: 0.4, lo: 0.15, hi: 0.78 },
  precision: {
    layerWeight: 0.35, layerMax: 0.3,
    nozzleWeight: 0.25, nozzleMax: 0.8,
    shrinkage: 0.28, calibrationPass: 0.2,
    lo: 0.12, hi: 0.75,
  },
  aesthetics: {
    layerWeight: 0.3, layerMax: 0.3,
    nozzleWeight: 0.2, nozzleMax: 0.8,
    ironing: 0.2, fuzzySkin: 0.1, material: 0.2,
    lo: 0.15, hi: 0.8,
  },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Map a raw index in [lo, hi] onto the 1–5 score band. */
const band = (raw, lo, hi) => 1 + 4 * clamp01((raw - lo) / Math.max(1e-9, hi - lo));
const on = (v) => (v ? 1 : 0);

/**
 * The five scores for one set of print settings.
 * @param {object} settings  a profile's settings (infill, wallLoops, layerHeight, …)
 * @param {object} [model]    DEFAULT_SCORE_MODEL, or the company's edited copy
 */
export function scoresFor(settings = {}, model = DEFAULT_SCORE_MODEL) {
  const m = { ...DEFAULT_SCORE_MODEL, ...model };
  const D = Math.max(1, num(m.section, 40));
  const lineWidth = Math.max(0.05, num(m.nozzle, 0.4) * num(m.lineWidthRatio, 1.05));

  const infill = clamp01(num(settings.infill, 15) / 100);
  const walls = Math.max(0, num(settings.wallLoops, 2));
  const layer = Math.max(0.01, num(settings.layerHeight, 0.2));
  const nozzle = Math.max(0.1, num(m.nozzle, 0.4));

  /* -- strength: moment of inertia of the walls + the infilled core -------- */
  const t = walls * lineWidth;                       // wall stack thickness
  const r = clamp01((D - 2 * t) / D);                // inner-section ratio
  const core = r ** 4;                               // core's share of the section I
  const wallI = 1 - core;                            // the walls' share
  const patternStrength = num(m.patternStrength?.[settings.infillPattern], 1);
  const matStrength = num(m.materialStrength?.[settings.materialType], 1);
  const structural = wallI + infill * core * patternStrength;
  const strength = band(structural * matStrength, m.strength.lo, m.strength.hi);

  /* -- speed: plastic volume + time-adders, inverted ----------------------- */
  const sp = m.speed;
  const layerTime = Math.max(0.2, num(sp.layerRef, 0.2) / layer); // thinner = more layers = slower
  const timeMult = layerTime
    * (1 + on(settings.ironing) * num(sp.ironing, 0.1))
    * (1 + on(settings.fuzzySkin) * num(sp.fuzzySkin, 0.35))
    * (1 + on(settings.adaptiveLayers) * num(sp.adaptiveLayers, 0.15));
  const timeIndex = (num(sp.base, 0.3) + (1 - num(sp.base, 0.3)) * structural) * timeMult;
  const speed = band(1 / Math.max(1e-6, timeIndex), sp.lo, sp.hi);

  /* -- cost: driven by material (fill) and time ---------------------------- */
  const c = m.cost;
  const costIndex = num(c.fillWeight, 0.6) * structural
    + num(c.timeWeight, 0.4) * clamp01(timeIndex / 2);
  // Higher cost index = more plastic and more time = dearer = a worse score.
  const costScore = 6 - band(costIndex, c.lo, c.hi);

  /* -- precision: fine layer + fine nozzle + shrinkage + calibration pass --- */
  const pr = m.precision;
  const precisionRaw = num(pr.layerWeight, 0.35) * (1 - clamp01(layer / num(pr.layerMax, 0.3)))
    + num(pr.nozzleWeight, 0.25) * (1 - clamp01(nozzle / num(pr.nozzleMax, 0.8)))
    + num(pr.shrinkage, 0.28) * on(settings.shrinkage)
    + num(pr.calibrationPass, 0.2) * on(settings.calibrationPass);
  const precision = band(precisionRaw, pr.lo, pr.hi);

  /* -- aesthetics: fine layer + fine nozzle + ironing + fuzzy + material ---- */
  const ae = m.aesthetics;
  const matAesthetic = num(m.materialAesthetic?.[settings.materialType], 1);
  const aestheticRaw = num(ae.layerWeight, 0.3) * (1 - clamp01(layer / num(ae.layerMax, 0.3)))
    + num(ae.nozzleWeight, 0.2) * (1 - clamp01(nozzle / num(ae.nozzleMax, 0.8)))
    + num(ae.ironing, 0.2) * on(settings.ironing)
    + num(ae.fuzzySkin, 0.1) * on(settings.fuzzySkin)
    + num(ae.material, 0.2) * matAesthetic;
  const aesthetics = band(aestheticRaw, ae.lo, ae.hi);

  const round = (x) => Math.round(x * 10) / 10;
  return {
    speed: round(speed),
    cost: round(costScore),
    strength: round(strength),
    precision: round(precision),
    aesthetics: round(aesthetics),
  };
}
