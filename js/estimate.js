/**
 * Material and time estimation. Pure.
 *
 * ============================ READ THIS FIRST ============================
 *
 * The specification's factor tables multiply out to 30.35x material for Extra
 * Strong against Display Only. Applied to a real part's geometry that is not
 * physically possible: a 20 x 30 x 40 box holding 24 cm3 of solid has a Display
 * Only baseline of about 7.3 cm3, and 30.35 times that is 222 cm3 - nine times
 * more plastic than the part could hold if it were machined from bar.
 *
 * The cause is that the sub-factors are multiplied. Going from 2 walls to 7
 * walls and from 15% infill to 95% both fill the SAME interior; multiplying a
 * 6.30x wall factor by a 4.83x infill factor charges that interior twice.
 *
 * That is not a reason to discard the measurements. It is a reason to be clear
 * about what they are: ratios observed on one calibration part, which describe
 * that part and do not generalise as multipliers. So this module does three
 * things rather than one:
 *
 *   1. GEOMETRIC. Shell plus infill computed from the settings the part will
 *      actually be printed with. Cannot exceed solid, because it is built from
 *      the solid. This is the quoting default.
 *   2. EMPIRICAL. The published factors applied exactly as specified, kept so
 *      the company's own measurements are visible and usable - but clamped at
 *      the solid volume of the part, with the clamp reported rather than
 *      silently applied.
 *   3. CALIBRATED. The geometric estimate corrected by a factor LEARNED from
 *      this company's own finished jobs (see calibration.js). This is the one
 *      the specification ranks third, and it is the one that gets better.
 *
 * A slicer estimate outranks all three, and an actual production record
 * outranks the slicer. Nothing here is ever presented as a slicer result.
 * ========================================================================
 */

import { num } from './money.js';
import { factorsFor, DEFAULT_FACTOR_MODEL, findProfile, BASELINE_PROFILE_ID } from './profiles.js';
import { gramsFor, materialType } from './materials.js';

/** The evidence hierarchy of section 6, best first. */
export const ESTIMATE_LEVELS = [
  {
    id: 'actual',
    rank: 1,
    name: 'Actual production',
    short: 'Actual',
    blurb: 'Measured from a print that really happened.',
  },
  {
    id: 'slicer',
    rank: 2,
    name: 'Slicer estimate',
    short: 'Slicer',
    blurb: 'Taken from the slicer that will drive the machine.',
  },
  {
    id: 'calibrated',
    rank: 3,
    name: 'Calibrated estimate',
    short: 'Calibrated',
    blurb: 'This app’s geometry, corrected by how its previous estimates '
      + 'compared with what the machines actually did.',
  },
  {
    id: 'empirical',
    rank: 4,
    name: 'Empirical factor estimate',
    short: 'Factors',
    blurb: 'The published print-intent factors applied to a Display Only '
      + 'baseline. Kept for comparison; clamped at the solid volume of the part.',
  },
  {
    id: 'geometric',
    rank: 5,
    name: 'Geometric approximation',
    short: 'Geometry',
    blurb: 'Shell and infill worked out from the model and the print settings. '
      + 'No production data behind it.',
  },
];

export function level(id) {
  return ESTIMATE_LEVELS.find((l) => l.id === id)
    || ESTIMATE_LEVELS.find((l) => l.id === 'geometric');
}

/**
 * Everything the estimator assumes, in one editable place.
 *
 * `flowEfficiency` is the fraction of the machine's rated volumetric flow it
 * sustains across a whole job. Nothing holds its rated flow: perimeters run
 * slower than infill, corners decelerate, and small layers wait for cooling.
 */
export const DEFAULT_ESTIMATE_ASSUMPTIONS = {
  nozzle: 0.4,
  lineWidthRatio: 1.05,
  skinLayers: 4,
  flowEfficiency: 0.55,
  layerOverheadSeconds: 2.0,
  /** A wall stack cannot be thicker than this share of the part's own volume. */
  solidAllowance: 1.02,
  supportScale: 1.0,
  /**
   * One hotend: the flush volume purged every time a layer changes colour.
   * A slicer states this in mm3 and so does the app - what it weighs depends on
   * which plastic is in the machine. 800 mm3 is about 1 g of PLA, which is the
   * order of magnitude a modern feeder flushes; your slicer knows yours.
   */
  purgePerChangeMm3: 800,
  /** A toolchanger: the volume wasted priming each head, once, at the start. */
  primePerSpoolMm3: 2500,
  /** The footprint a purge tower takes on the plate, in mm. */
  purgeTower: { x: 30, y: 30 },
  /** What fraction of layers contain a colour transition. The slicer knows;
   *  this is the app's assumption until you paste the slicer's figure in. */
  colourInterleave: 0.15,
  primeG: 1.5,
};

const lineWidth = (a) => num(a.nozzle, 0.4) * num(a.lineWidthRatio, 1.05);

/**
 * Printed volume for a set of print settings, from the measured geometry.
 *
 * shell   the walls, all faces, at wall-loop thickness
 * skin    the extra solid on the top and bottom faces beyond the wall thickness
 * infill  what remains, at the infill density, adjusted for the pattern
 *
 * Every term is bounded by the part's own solid volume, so the total is too.
 */
export function geometricVolume(geometry, settings, assumptions = DEFAULT_ESTIMATE_ASSUMPTIONS) {
  const a = { ...DEFAULT_ESTIMATE_ASSUMPTIONS, ...assumptions };
  const solid = Math.max(0, num(geometry?.volume));
  const area = Math.max(0, num(geometry?.area));
  const footprint = Math.max(0, num(geometry?.footprintArea));
  if (solid <= 0) {
    return { shell: 0, skin: 0, infill: 0, total: 0, solid: 0, fillFraction: 0 };
  }

  const walls = Math.max(0, num(settings?.wallLoops, 2));
  const wallThickness = walls * lineWidth(a);
  const shell = Math.min(solid, area * wallThickness);

  const skinThickness = Math.max(0, num(a.skinLayers, 4) * num(settings?.layerHeight, 0.2));
  const skinExtra = Math.max(0, skinThickness - wallThickness);
  const skin = Math.min(Math.max(0, solid - shell), footprint * 2 * skinExtra);

  const interior = Math.max(0, solid - shell - skin);
  const density = Math.min(1, Math.max(0, num(settings?.infill, 15) / 100));
  // The pattern's material factor is a real efficiency: gyroid lays down about
  // 5% less than rectilinear for the same nominal density.
  const pattern = DEFAULT_FACTOR_MODEL.infillPattern.values[settings?.infillPattern];
  const patternEfficiency = pattern ? num(pattern.material, 1) : 1;
  const infill = interior * density * patternEfficiency;

  const total = Math.min(solid * num(a.solidAllowance, 1.02), shell + skin + infill);
  return { shell, skin, infill, total, solid, fillFraction: total / solid };
}

/**
 * Print time from a printed volume.
 *
 * Two terms that are genuinely different: extruding takes as long as the
 * plastic takes to come out, and every layer costs a fixed amount whatever is
 * on it. A tall thin part is dominated by the second and a squat solid one by
 * the first, which is exactly why laying a part down is worth so much.
 */
export function timeFor(volumeMm3, geometry, settings, printer, assumptions = DEFAULT_ESTIMATE_ASSUMPTIONS) {
  const a = { ...DEFAULT_ESTIMATE_ASSUMPTIONS, ...assumptions };
  const flow = Math.max(0.1, num(printer?.flowRate, 8));
  const efficiency = Math.min(1, Math.max(0.05, num(a.flowEfficiency, 0.55)));
  const extrudeSeconds = num(volumeMm3) / (flow * efficiency);

  const height = Math.max(0, num(geometry?.size?.z));
  const layerHeight = Math.max(0.01, num(settings?.layerHeight, 0.2));
  const layers = Math.ceil(height / layerHeight);
  const layerSeconds = layers * Math.max(0, num(a.layerOverheadSeconds, 2));

  return {
    extrudeMinutes: extrudeSeconds / 60,
    layerMinutes: layerSeconds / 60,
    layers,
    minutes: (extrudeSeconds + layerSeconds) / 60,
  };
}

/**
 * The empirical estimator: the published factors, exactly as specified.
 *
 * Clamped at the solid volume of the part, because a part cannot contain more
 * plastic than its own volume however the factors multiply out. `clamped` says
 * whether the clamp bit and by how much, so the number is never quietly wrong.
 */
export function empiricalVolume(geometry, profile, profiles, {
  model = DEFAULT_FACTOR_MODEL,
  assumptions = DEFAULT_ESTIMATE_ASSUMPTIONS,
} = {}) {
  const a = { ...DEFAULT_ESTIMATE_ASSUMPTIONS, ...assumptions };
  const baselineProfile = findProfile(profiles, BASELINE_PROFILE_ID);
  const baseline = geometricVolume(geometry, baselineProfile.settings, a);
  const factors = factorsFor(profile.settings, model);

  const raw = baseline.total * factors.material;
  const ceiling = Math.max(0, num(geometry?.volume)) * num(a.solidAllowance, 1.02);
  const total = Math.min(raw, ceiling);

  return {
    baseline: baseline.total,
    factor: factors.material,
    factors,
    raw,
    ceiling,
    total,
    clamped: raw > ceiling + 1e-9,
    overBy: raw > ceiling ? raw / Math.max(1e-9, ceiling) : 1,
  };
}

/* --------------------------------------------------------------- estimate -- */

const gramsOf = (volume, material) => gramsFor(volume, material);

/**
 * The whole estimate for one part on one machine.
 *
 * Returns every level it could work out, says which one it is using and why,
 * and never hides a disagreement between them.
 */
export function estimatePart({
  geometry,
  profile,
  profiles,
  printer,
  material,
  quantity = 1,
  purgeG = 0,
  changeMinutes = 0,
  hardwareExtraG = 0,
  mix = null,
  slicer = null,
  actual = null,
  calibration = null,
  method = 'auto',
  model = DEFAULT_FACTOR_MODEL,
  assumptions = DEFAULT_ESTIMATE_ASSUMPTIONS,
  partsPerPlate: perPlate = 1,
  /**
   * When several part types share one bed, how many physical plates THIS type
   * actually appears on is a fact about the shared packing, not a plain
   * ceil(quantity / perPlate) - the type may be spread unevenly across the
   * plates it shares with other shapes. Passed straight through when given.
   */
  jobsOverride = null,
}) {
  const a = { ...DEFAULT_ESTIMATE_ASSUMPTIONS, ...assumptions };
  const notes = [];
  const settings = profile.settings;

  const geo = geometricVolume(geometry, settings, a);
  const rawTime = timeFor(geo.total, geometry, settings, printer, a);
  // Every filament change stops the machine for a moment. It is machine time,
  // so it belongs in the print duration and therefore in the machine cost and
  // the electricity - and nowhere near labour.
  const changeM = Math.max(0, num(changeMinutes));
  const geoTime = { ...rawTime, changeMinutes: changeM, minutes: rawTime.minutes + changeM };
  const empirical = empiricalVolume(geometry, profile, profiles, { model, assumptions: a });
  const empiricalTime = (() => {
    const baselineProfile = findProfile(profiles, BASELINE_PROFILE_ID);
    const base = geometricVolume(geometry, baselineProfile.settings, a);
    const baseTime = timeFor(base.total, geometry, baselineProfile.settings, printer, a);
    const factors = factorsFor(settings, model);
    const raw = baseTime.minutes * factors.time;
    // Time cannot be less than the plastic takes to come out of the nozzle.
    const floor = timeFor(empirical.total, geometry, settings, printer, a).minutes;
    return { raw, minutes: Math.max(raw, floor), factor: factors.time, floored: raw < floor };
  })();

  if (empirical.clamped) {
    notes.push({
      level: 'warn',
      text: `The published ${profile.name} factor of ${empirical.factor.toFixed(2)}× asks for `
        + `${(empirical.raw / 1000).toFixed(1)} cm³ of material in a part whose solid volume is only `
        + `${(geo.solid / 1000).toFixed(1)} cm³. It has been held at the solid volume. `
        + 'The factors multiply the wall and infill effects together, which counts the same '
        + 'interior twice — they describe the part they were measured on, not this one.',
    });
  }

  /* ---- support, purge and waste apply to whichever body volume is chosen -- */

  // The part may be printed in several filaments at once. Splitting by VOLUME
  // and only then converting to grams is the whole point: different plastics
  // have different densities, so half the volume in each is not half the weight
  // in each.
  const filaments = (mix && mix.length ? mix : [{ material, fraction: 1 }])
    .filter((m) => m.material && m.fraction > 0);

  const buildLevels = (bodyVolume, printMinutes, source) => {
    const supportVolume = Math.max(0, num(geometry?.supportVolume)) * num(a.supportScale, 1);

    const perFilament = filaments.map((f) => {
      const volume = bodyVolume * f.fraction;
      const g = gramsOf(volume, f.material);
      return {
        material: f.material,
        fraction: f.fraction,
        volume,
        grams: g,
        wasteFactor: Math.max(0, num(f.material?.wasteFactor, 0.03)),
      };
    });
    const partG = perFilament.reduce((t, f) => t + f.grams, 0);

    // Supports and the purge tower print in whichever filament does most of the
    // part, because that is the one already loaded when they are laid down.
    const primary = [...filaments].sort((x, y) => y.fraction - x.fraction)[0]?.material || material;
    const supportG = gramsOf(supportVolume, primary);
    // How much is purged is a property of the machine, worked out in
    // filaments.js where the differences between them live.
    const purge = Math.max(0, num(purgeG));
    const primeG = num(a.primeG, 1.5);
    const subtotal = partG + supportG + purge + primeG + Math.max(0, num(hardwareExtraG));

    // Waste is a property of each plastic, so it is worked out per filament and
    // the shared extras follow the primary one.
    const wasteG = perFilament.reduce((t, f) => t + f.grams * f.wasteFactor, 0)
      + (supportG + purge + primeG + Math.max(0, num(hardwareExtraG)))
        * Math.max(0, num(primary?.wasteFactor, 0.03));
    return {
      source,
      bodyVolume,
      supportVolume,
      partG,
      perFilament,
      supportG,
      purgeG: purge,
      primeG,
      hardwareG: Math.max(0, num(hardwareExtraG)),
      wasteG,
      totalG: subtotal + wasteG,
      printMinutes,
    };
  };

  const levels = {
    geometric: buildLevels(geo.total, geoTime.minutes, 'geometric'),
    empirical: buildLevels(empirical.total, empiricalTime.minutes, 'empirical'),
  };

  if (calibration && (calibration.materialCorrection || calibration.timeCorrection)) {
    const mc = num(calibration.materialCorrection, 1) || 1;
    const tc = num(calibration.timeCorrection, 1) || 1;
    levels.calibrated = buildLevels(geo.total * mc, geoTime.minutes * tc, 'calibrated');
    levels.calibrated.correction = { material: mc, time: tc, samples: num(calibration.samples, 0) };
  }

  if (slicer && (num(slicer.grams) > 0 || num(slicer.minutes) > 0)) {
    const grams = num(slicer.grams);
    levels.slicer = {
      source: 'slicer',
      bodyVolume: grams > 0 ? (grams / Math.max(0.01, materialType(material?.type).density)) * 1000 : geo.total,
      supportVolume: 0,
      partG: grams,
      supportG: 0,
      purgeG: 0,
      primeG: 0,
      hardwareG: 0,
      wasteG: grams * Math.max(0, num(material?.wasteFactor, 0.03)),
      totalG: grams * (1 + Math.max(0, num(material?.wasteFactor, 0.03))),
      printMinutes: num(slicer.minutes),
    };
    notes.push({
      level: 'ok',
      text: 'A slicer estimate is present, so it is being used in place of this '
        + 'app’s own geometry.',
    });
  }

  if (actual && (num(actual.grams) > 0 || num(actual.minutes) > 0)) {
    levels.actual = {
      source: 'actual',
      bodyVolume: levels.slicer?.bodyVolume ?? geo.total,
      supportVolume: 0,
      partG: num(actual.grams),
      supportG: 0,
      purgeG: 0,
      primeG: 0,
      hardwareG: 0,
      wasteG: 0,
      totalG: num(actual.grams),
      printMinutes: num(actual.minutes),
    };
  }

  /* --------------------------------------------------------- which level -- */

  const order = ['actual', 'slicer', 'calibrated', 'geometric', 'empirical'];
  const chosenId = method !== 'auto' && levels[method]
    ? method
    : order.find((id) => levels[id]) || 'geometric';
  const chosen = levels[chosenId];

  if (method !== 'auto' && !levels[method]) {
    notes.push({
      level: 'warn',
      text: `There is no ${level(method).name.toLowerCase()} for this part, so the `
        + `${level(chosenId).name.toLowerCase()} is being used instead.`,
    });
  }

  /* -------------------------------------------- how the levels compare ---- */

  const disagreement = levels.empirical && levels.geometric
    ? levels.empirical.totalG / Math.max(1e-9, levels.geometric.totalG)
    : 1;

  const perPlateCount = Math.max(1, Math.round(num(perPlate, 1)));
  const jobs = jobsOverride != null
    ? Math.max(1, Math.round(num(jobsOverride, 1)))
    : Math.max(1, Math.ceil(Math.max(1, Math.round(num(quantity, 1))) / perPlateCount));

  return {
    method: chosenId,
    level: level(chosenId),
    levels,
    notes,
    geometryVolume: geo,
    empiricalVolume: empirical,
    timeParts: geoTime,
    disagreement,
    perPlate: perPlateCount,
    jobs,
    /** Per part. */
    grams: chosen.totalG,
    minutes: chosen.printMinutes,
    /** For a whole plate: one heat-up shared, the rest per part. */
    jobMinutes: chosen.printMinutes * Math.min(perPlateCount, Math.max(1, Math.round(num(quantity, 1))))
      + num(printer?.heatupMinutes, 0),
    assumptions: a,
  };
}

/** The share of a job's time one part is responsible for, heat-up included. */
export function machineMinutesPerPart(estimate, printer) {
  const heatup = num(printer?.heatupMinutes, 0);
  return num(estimate.minutes) + heatup / Math.max(1, num(estimate.perPlate, 1));
}
