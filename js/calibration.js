/**
 * Learning from finished jobs. Pure.
 *
 * This is section 36: the app compares what it predicted, what the slicer
 * predicted, and what actually happened, and uses the difference to make the
 * next estimate better.
 *
 * Three rules keep it honest.
 *
 *   A correction is only offered once there is enough evidence for it. Two
 *   prints is an anecdote. The threshold is configurable and is stated
 *   wherever a correction is shown.
 *
 *   A correction never rewrites history. Past quotes keep the numbers they were
 *   priced with; the correction applies from now on.
 *
 *   The correction is a MEDIAN, not a mean. One catastrophic failed print that
 *   ran nine hours before anybody noticed would otherwise move the estimator
 *   for everything.
 */

import { num } from './money.js';

export const DEFAULT_CALIBRATION = {
  enabled: true,
  minimumSamples: 5,
  /** Corrections outside this band are treated as a data-entry error. */
  clamp: [0.25, 4],
  scope: 'profile',
};

export const CALIBRATION_SCOPES = [
  { id: 'global', name: 'One correction for everything' },
  { id: 'profile', name: 'One per print profile' },
  { id: 'printer', name: 'One per printer' },
  { id: 'profile+printer', name: 'One per profile and printer pair' },
];

function keyFor(scope, sample) {
  switch (scope) {
    case 'printer': return sample.printerId || 'unknown';
    case 'profile+printer': return `${sample.profileId || 'unknown'}|${sample.printerId || 'unknown'}`;
    case 'global': return 'global';
    case 'profile':
    default: return sample.profileId || 'unknown';
  }
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Turn a project's attempts into calibration samples.
 *
 * A failed print contributes to the failure rate but NOT to the time or
 * material correction: an eight-hour spaghetti run says nothing about how long
 * a good part takes, and including it would drag every future estimate up.
 */
export function samplesFrom(projects, { estimator = null } = {}) {
  const out = [];
  for (const project of projects) {
    for (const part of project.parts || []) {
      for (const attempt of part.attempts || []) {
        const each = Math.max(1, num(attempt.quantity, 1));
        const sample = {
          at: attempt.at,
          projectId: project.id,
          partId: part.id,
          partName: part.name,
          profileId: part.profileId,
          printerId: attempt.printerId || part.printerId,
          materialId: attempt.materialId || part.materialId,
          failed: Boolean(attempt.failed),
          accepted: num(attempt.accepted),
          rejected: num(attempt.rejected),
          quantity: each,
          actualMinutes: num(attempt.minutes) / each,
          actualGrams: num(attempt.grams) / each,
          estimatedMinutes: num(attempt.estimatedMinutes) / each,
          estimatedGrams: num(attempt.estimatedGrams) / each,
          slicerMinutes: num(part.slicer?.minutes),
          slicerGrams: num(part.slicer?.grams),
        };
        if (estimator) {
          const fresh = estimator(part, project);
          if (fresh) {
            sample.estimatedMinutes = sample.estimatedMinutes || num(fresh.minutes);
            sample.estimatedGrams = sample.estimatedGrams || num(fresh.grams);
          }
        }
        out.push(sample);
      }
    }
  }
  return out;
}

/**
 * The corrections the evidence supports, keyed by scope.
 *
 * Every entry says how many samples it rests on and how far the estimates were
 * spread, because a correction of 1.4 from five samples that ranged 0.8 to 2.1
 * is not the same claim as 1.4 from fifty that all landed near it.
 */
export function calibrate(samples, config = DEFAULT_CALIBRATION) {
  const c = { ...DEFAULT_CALIBRATION, ...(config || {}) };
  const groups = new Map();

  for (const sample of samples) {
    const key = keyFor(c.scope, sample);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        scope: c.scope,
        profileId: sample.profileId,
        printerId: sample.printerId,
        timeRatios: [],
        materialRatios: [],
        attempts: 0,
        printed: 0,
        accepted: 0,
        rejected: 0,
        failed: 0,
      });
    }
    const group = groups.get(key);
    group.attempts += 1;
    group.printed += sample.quantity;
    group.accepted += sample.accepted;
    group.rejected += sample.rejected;
    if (sample.failed) { group.failed += 1; continue; }

    if (sample.estimatedMinutes > 0 && sample.actualMinutes > 0) {
      group.timeRatios.push(sample.actualMinutes / sample.estimatedMinutes);
    }
    if (sample.estimatedGrams > 0 && sample.actualGrams > 0) {
      group.materialRatios.push(sample.actualGrams / sample.estimatedGrams);
    }
  }

  const [low, high] = c.clamp;
  const out = [];
  for (const group of groups.values()) {
    const timeSamples = group.timeRatios.length;
    const materialSamples = group.materialRatios.length;
    const enoughTime = timeSamples >= c.minimumSamples;
    const enoughMaterial = materialSamples >= c.minimumSamples;

    const rawTime = median(group.timeRatios);
    const rawMaterial = median(group.materialRatios);

    out.push({
      ...group,
      samples: Math.max(timeSamples, materialSamples),
      timeSamples,
      materialSamples,
      timeCorrection: enoughTime ? clampTo(rawTime, low, high) : 1,
      materialCorrection: enoughMaterial ? clampTo(rawMaterial, low, high) : 1,
      rawTimeCorrection: rawTime,
      rawMaterialCorrection: rawMaterial,
      applied: enoughTime || enoughMaterial,
      timeSpread: spread(group.timeRatios),
      materialSpread: spread(group.materialRatios),
      rejectionRate: group.printed > 0 ? group.rejected / group.printed : null,
      failureRate: group.attempts > 0 ? group.failed / group.attempts : null,
      minimumSamples: c.minimumSamples,
      reason: enoughTime || enoughMaterial
        ? `From ${Math.max(timeSamples, materialSamples)} finished prints.`
        : `Only ${Math.max(timeSamples, materialSamples)} usable prints; `
          + `${c.minimumSamples} are needed before a correction is applied.`,
    });
  }

  return out.sort((a, b) => b.samples - a.samples);
}

function clampTo(value, low, high) {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.min(high, Math.max(low, value));
}

/** min, max and the interquartile range, so a wide spread is visible. */
function spread(values) {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return { min: sorted[0], max: sorted[sorted.length - 1], q1: at(0.25), q3: at(0.75) };
}

/**
 * The correction that applies to one part, or none.
 *
 * Falls back by NAME up the scope ladder - profile+printer, then profile, then
 * global - never by position in the list.
 */
export function correctionFor(corrections, { profileId, printerId }) {
  if (!corrections?.length) return null;
  const wanted = [
    `${profileId}|${printerId}`,
    profileId,
    printerId,
    'global',
  ];
  for (const key of wanted) {
    const hit = corrections.find((c) => c.key === key && c.applied);
    if (hit) return hit;
  }
  return null;
}

/**
 * How the three levels compared, as errors rather than ratios.
 *
 * A quote is wrong by an amount of money, so the interesting number is the
 * signed percentage error, not a multiplier.
 */
export function errorReport(samples) {
  const rows = samples
    .filter((s) => !s.failed)
    .map((s) => ({
      ...s,
      timeError: s.estimatedMinutes > 0 ? (s.actualMinutes - s.estimatedMinutes) / s.estimatedMinutes : null,
      materialError: s.estimatedGrams > 0 ? (s.actualGrams - s.estimatedGrams) / s.estimatedGrams : null,
      slicerTimeError: s.slicerMinutes > 0 ? (s.actualMinutes - s.slicerMinutes) / s.slicerMinutes : null,
      slicerMaterialError: s.slicerGrams > 0 ? (s.actualGrams - s.slicerGrams) / s.slicerGrams : null,
    }));

  const stat = (pick) => {
    const values = rows.map(pick).filter((v) => v != null && Number.isFinite(v));
    if (!values.length) return null;
    return {
      n: values.length,
      median: median(values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      worst: values.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0),
    };
  };

  return {
    rows,
    appTime: stat((r) => r.timeError),
    appMaterial: stat((r) => r.materialError),
    slicerTime: stat((r) => r.slicerTimeError),
    slicerMaterial: stat((r) => r.slicerMaterialError),
  };
}
