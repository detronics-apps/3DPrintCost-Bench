/**
 * Shipping methods and the free-shipping rule. Pure.
 *
 * Shipping is outside the rule of thirds. It is a cost the customer is being
 * passed, not part of what the part costs to make, and nothing in this file may
 * ever be added into the Cost to Company. The engine enforces that; this module
 * only prices the movement of a box.
 */

import { num } from './money.js';

export const PACKAGE_SIZES = [
  { id: 'S', name: 'Small' },
  { id: 'M', name: 'Medium' },
  { id: 'L', name: 'Large' },
  { id: 'XL', name: 'Extra large' },
];

const method = (spec) => ({
  country: 'ZA',
  insurance: 0,
  surcharge: 0,
  archived: false,
  qualifiesForFree: true,
  ...spec,
});

/**
 * `maxDims` is in millimetres, sorted longest first, and is compared against the
 * package sorted the same way - a box can go in a locker in any orientation.
 * The PUDO locker dimensions are the published locker sizes; check them, they
 * change.
 */
export const DEFAULT_SHIPPING = [
  method({
    id: 'collect',
    name: 'Customer collection',
    carrier: 'None',
    size: 'S',
    basePrice: 0,
    days: 0,
    maxDims: [100000, 100000, 100000],
    maxWeightG: 1000000,
    country: '*',
    note: 'Collected from the workshop.',
  }),
  method({
    id: 'pudo-s',
    name: 'PUDO locker – Small',
    carrier: 'PUDO',
    size: 'S',
    basePrice: 90,
    days: 3,
    maxDims: [600, 410, 80],
    maxWeightG: 5000,
    country: 'ZA',
    note: 'Locker-to-locker. The default South African option.',
  }),
  method({
    id: 'pudo-m',
    name: 'PUDO locker – Medium',
    carrier: 'PUDO',
    size: 'M',
    basePrice: 100,
    days: 3,
    maxDims: [600, 410, 190],
    maxWeightG: 10000,
    country: 'ZA',
  }),
  method({
    id: 'pudo-l',
    name: 'PUDO locker – Large',
    carrier: 'PUDO',
    size: 'L',
    basePrice: 110,
    days: 3,
    maxDims: [600, 410, 410],
    maxWeightG: 15000,
    country: 'ZA',
  }),
  method({
    id: 'pudo-xl',
    name: 'PUDO locker – Extra large',
    carrier: 'PUDO',
    size: 'XL',
    basePrice: 130,
    days: 3,
    maxDims: [600, 410, 690],
    maxWeightG: 20000,
    country: 'ZA',
  }),
  method({
    id: 'courier-za',
    name: 'Courier, door to door',
    carrier: 'Courier',
    size: 'L',
    basePrice: 150,
    days: 2,
    maxDims: [1000, 600, 600],
    maxWeightG: 30000,
    country: 'ZA',
  }),
  method({
    id: 'express-za',
    name: 'Express courier, overnight',
    carrier: 'Courier',
    size: 'L',
    basePrice: 280,
    days: 1,
    maxDims: [1000, 600, 600],
    maxWeightG: 30000,
    country: 'ZA',
    qualifiesForFree: false,
    note: 'Express is a service the customer chose, so free shipping does not '
      + 'cover it by default.',
  }),
  method({
    id: 'intl',
    name: 'International courier',
    carrier: 'Courier',
    size: 'L',
    basePrice: 900,
    days: 7,
    maxDims: [1000, 600, 600],
    maxWeightG: 20000,
    country: '*',
    qualifiesForFree: false,
    note: 'Duties and import taxes are the receiver’s, and are not in this price.',
  }),
  method({
    id: 'nl-postnl',
    name: 'PostNL parcel',
    carrier: 'PostNL',
    size: 'M',
    basePrice: 7.25,
    days: 2,
    maxDims: [1000, 500, 500],
    maxWeightG: 23000,
    country: 'NL',
  }),
  method({
    id: 'us-ground',
    name: 'Ground shipping',
    carrier: 'Carrier',
    size: 'M',
    basePrice: 12,
    days: 5,
    maxDims: [1000, 600, 600],
    maxWeightG: 22000,
    country: 'US',
  }),
  method({
    id: 'cn-express',
    name: 'Domestic express',
    carrier: 'SF',
    size: 'M',
    basePrice: 15,
    days: 2,
    maxDims: [1000, 600, 600],
    maxWeightG: 20000,
    country: 'CN',
  }),
];

export function methodsForCountry(methods, countryId) {
  return methods.filter((m) => !m.archived && (m.country === '*' || m.country === countryId));
}

/** Named fallback, never positional. */
export function findShipping(methods, id) {
  return methods.find((m) => m.id === id)
    || methods.find((m) => m.id === 'collect')
    || methods[0];
}

/** Does the package fit this method, in any orientation? */
export function packageFits(m, dims, weightG) {
  const need = [num(dims?.x), num(dims?.y), num(dims?.z)].sort((a, b) => b - a);
  const have = [...(m.maxDims || [0, 0, 0])].map(num).sort((a, b) => b - a);
  const dimsOk = need.every((v, i) => v <= have[i] + 1e-9);
  const weightOk = num(weightG) <= num(m.maxWeightG, Infinity) + 1e-9;
  return { fits: dimsOk && weightOk, dimsOk, weightOk };
}

/**
 * The cheapest method in the country that the package actually fits.
 * Returns `null` when nothing fits, which is a real answer - the alternative is
 * quoting a locker for a box that will not go in one.
 */
export function autoSelectShipping(methods, countryId, dims, weightG, { excludeCollection = true } = {}) {
  const candidates = methodsForCountry(methods, countryId)
    .filter((m) => !(excludeCollection && m.basePrice === 0 && m.id === 'collect'))
    .filter((m) => packageFits(m, dims, weightG).fits)
    .sort((a, b) => num(a.basePrice) - num(b.basePrice));
  return candidates[0] || null;
}

export const DEFAULT_FREE_SHIPPING = {
  enabled: true,
  threshold: 900,
  /** 'after' means the discounted part value is what has to clear the bar. */
  appliesTo: 'after',
  /** 'order' or 'part' - whether each line has to clear the bar on its own. */
  basis: 'order',
};

/**
 * Does this order earn free shipping?
 *
 * The threshold is measured against the PART SELLING VALUE, never against the
 * invoice total - otherwise the shipping charge helps pay for itself and a
 * R820 order with R90 shipping qualifies while the same parts alone do not.
 */
export function freeShipping(rule, { partValueBeforeDiscount, partValueAfterDiscount, lineValues = [] }) {
  const config = { ...DEFAULT_FREE_SHIPPING, ...(rule || {}) };
  if (!config.enabled) {
    return { free: false, threshold: num(config.threshold), measured: 0, reason: 'Free shipping is turned off.' };
  }
  const threshold = num(config.threshold);
  const measured = config.appliesTo === 'before'
    ? num(partValueBeforeDiscount)
    : num(partValueAfterDiscount);

  if (config.basis === 'part') {
    const best = lineValues.length ? Math.max(...lineValues.map(num)) : 0;
    return {
      free: best >= threshold,
      threshold,
      measured: best,
      basis: 'part',
      reason: best >= threshold
        ? 'A single line clears the free-shipping threshold.'
        : 'No single line clears the free-shipping threshold.',
    };
  }

  return {
    free: measured >= threshold,
    threshold,
    measured,
    basis: 'order',
    reason: measured >= threshold
      ? 'The part value clears the free-shipping threshold.'
      : `The part value is short of the threshold by ${(threshold - measured).toFixed(2)}.`,
  };
}

/** What a chosen method costs, before any free-shipping waiver. */
export function shippingCost(m, { insured = false } = {}) {
  if (!m) return { base: 0, insurance: 0, surcharge: 0, total: 0 };
  const base = num(m.basePrice);
  const insurance = insured ? num(m.insurance) : 0;
  const surcharge = num(m.surcharge);
  return { base, insurance, surcharge, total: base + insurance + surcharge };
}
