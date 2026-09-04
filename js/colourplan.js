/**
 * Colour by Z-height, and the pause-swaps it implies. Pure.
 *
 * A part's colour is described as bands up its height - 0–10 mm red, 10–24 mm
 * blue, 24–30 mm green. The machine loads a few colours in its heads and changes
 * those automatically; a colour it did not load is reached by PAUSING at the
 * height where it starts and swapping a spool by hand. This works out which
 * colours are loaded, which are manual swaps, and the schedule of those swaps -
 * "at 24 mm: blue → green" - so the bench knows what to do and what it costs.
 *
 * A manual swap costs three things, and the caller is handed all three: the
 * labour of doing it, the machine WAITING paused until someone gets to it, and
 * the fact that a plate with any manual swap cannot be left to run unattended -
 * so it is flagged attended-only and kept out of overnight scheduling.
 *
 * The loaded colours are the first `heads` DISTINCT colours from the bottom up,
 * because the machine has to start with the bottom colour loaded and can hold
 * only so many; a colour that first appears higher than that is a swap.
 */

import { num } from './money.js';

/** The distinct colours a part uses, bottom to top, from its bands. */
export function bandColours(bands) {
  const out = [];
  for (const b of bands || []) {
    if (b && b.materialId && !out.includes(b.materialId)) out.push(b.materialId);
  }
  return out;
}

/**
 * The colour plan for one part's bands.
 *
 *   heads: how many colours the machine loads and changes automatically
 *
 * Returns { colours, loaded, manual, swaps:[{atHeight,from,to}], swapCount,
 *           needsAttendance }.
 */
export function partColourPlan(bands, { heads = 4 } = {}) {
  const clean = (bands || [])
    .filter((b) => b && b.materialId)
    .map((b) => ({ upTo: b.upTo == null ? null : Math.max(0, num(b.upTo)), materialId: b.materialId }));

  const colours = bandColours(clean);
  const limit = Math.max(1, Math.round(num(heads, 1)));
  const loaded = colours.slice(0, limit);
  const loadedSet = new Set(loaded);
  const manual = colours.slice(limit);

  // Walk the bands bottom to top; a transition INTO a colour that is not loaded
  // is a pause-and-swap at the height the previous band ended.
  const swaps = [];
  let prev = null;
  for (const band of clean) {
    if (prev && prev.materialId !== band.materialId && !loadedSet.has(band.materialId)) {
      swaps.push({ atHeight: prev.upTo, from: prev.materialId, to: band.materialId });
    }
    prev = band;
  }

  return {
    colours,
    loaded,
    manual,
    swaps,
    swapCount: swaps.length,
    /** Any manual swap means a person has to be at the machine, so no overnight. */
    needsAttendance: swaps.length > 0,
  };
}

/**
 * What the manual swaps on a part cost, per finished part.
 *
 *   swapLabourMinutes  the hands-on time to pause, swap and resume one spool
 *   swapWaitMinutes    the machine sits paused until someone can get to it; this
 *                      is idle machine time that extends the job's clock
 */
export function swapCost(swapCount, {
  swapLabourMinutes = 3, swapWaitMinutes = 20, rate = 0,
} = {}) {
  const n = Math.max(0, Math.round(num(swapCount)));
  const labourMinutes = n * Math.max(0, num(swapLabourMinutes));
  const waitMinutes = n * Math.max(0, num(swapWaitMinutes));
  return {
    swaps: n,
    labourMinutes,
    waitMinutes,
    labourCost: (labourMinutes / 60) * Math.max(0, num(rate)),
    needsAttendance: n > 0,
  };
}
