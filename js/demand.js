/**
 * Demand pricing. Pure.
 *
 * The demand multiplier is a COMMERCIAL lever and nothing else. It must never
 * touch material, electricity, machine time or the Cost to Company: the part
 * costs what it costs whether the workshop is busy or empty, and a pricing
 * model that pretends otherwise stops being able to tell you whether you are
 * making money.
 *
 * This module decides the multiplier. pricing.js decides where it lands, and
 * the default there is the commercial and profit thirds only.
 */

import { num } from './money.js';

export const DEFAULT_DEMAND_BANDS = [
  { upTo: 0.30, multiplier: 0.80, label: 'Quiet' },
  { upTo: 0.60, multiplier: 0.90, label: 'Light' },
  { upTo: 0.80, multiplier: 1.00, label: 'Normal' },
  { upTo: 0.90, multiplier: 1.10, label: 'Busy' },
  { upTo: 0.95, multiplier: 1.25, label: 'Very busy' },
  { upTo: 1.00, multiplier: 1.50, label: 'At capacity' },
  { upTo: Infinity, multiplier: 1.75, label: 'Over capacity' },
];

export const DEFAULT_DEMAND = {
  mode: 'manual',
  manualMultiplier: 1.0,
  bands: DEFAULT_DEMAND_BANDS,
  /** What utilisation is measured against. */
  capacitySource: 'machineHours',
  availableMachineHoursPerWeek: 120,
  availableLabourHoursPerWeek: 20,
  committedMachineHours: 0,
  committedLabourHours: 0,
  queuedJobs: 0,
  maxQueuedJobs: 20,
};

export const CAPACITY_SOURCES = [
  { id: 'machineHours', name: 'Machine hours committed', unit: 'h' },
  { id: 'labourHours', name: 'Labour hours committed', unit: 'h' },
  { id: 'queue', name: 'Jobs in the queue', unit: 'jobs' },
];

/** Utilisation as a fraction. Over 1 is legal and meaningful: it is overload. */
export function utilisation(config) {
  const c = { ...DEFAULT_DEMAND, ...(config || {}) };
  switch (c.capacitySource) {
    case 'labourHours': {
      const available = Math.max(1e-9, num(c.availableLabourHoursPerWeek));
      return Math.max(0, num(c.committedLabourHours)) / available;
    }
    case 'queue': {
      const available = Math.max(1e-9, num(c.maxQueuedJobs));
      return Math.max(0, num(c.queuedJobs)) / available;
    }
    case 'machineHours':
    default: {
      const available = Math.max(1e-9, num(c.availableMachineHoursPerWeek));
      return Math.max(0, num(c.committedMachineHours)) / available;
    }
  }
}

/**
 * The band a utilisation falls in.
 *
 * Bands are read in order and the first whose ceiling is not yet passed wins,
 * so an unsorted or overlapping table behaves predictably rather than by
 * whichever entry happened to be looked at last.
 */
export function bandFor(bands, value) {
  const list = [...(bands || DEFAULT_DEMAND_BANDS)].sort((a, b) => num(a.upTo, Infinity) - num(b.upTo, Infinity));
  const x = Math.max(0, num(value));
  for (const band of list) {
    if (x <= num(band.upTo, Infinity)) return band;
  }
  return list[list.length - 1];
}

/**
 * The multiplier in force, and why.
 *
 * Always returns a reason string, because a price that moved without an
 * explanation is the fastest way to lose a customer's trust in a quote.
 */
export function demandMultiplier(config) {
  const c = { ...DEFAULT_DEMAND, ...(config || {}) };
  if (c.mode !== 'capacity') {
    const m = Math.max(0, num(c.manualMultiplier, 1));
    return {
      multiplier: m,
      mode: 'manual',
      utilisation: null,
      band: null,
      reason: m === 1
        ? 'Demand pricing is at normal.'
        : `Demand is set by hand to ${m.toFixed(2)}×.`,
    };
  }

  const used = utilisation(c);
  const band = bandFor(c.bands, used);
  return {
    multiplier: Math.max(0, num(band.multiplier, 1)),
    mode: 'capacity',
    utilisation: used,
    band,
    reason: `The workshop is ${(used * 100).toFixed(0)}% committed (${band.label}), `
      + `so the commercial component is at ${num(band.multiplier, 1).toFixed(2)}×.`,
  };
}
