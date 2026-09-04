/**
 * The rule of thirds, the internal allocations, and the customer-facing
 * adjustments. Pure.
 *
 * The specification is unusually clear about one thing and this module exists
 * to enforce it: the company's percentage list is NOT a markup. Adding
 * 20 + 20 + 10 + 50 + 10 + 15 + 10 + 5 + 10 + 2 gives a 152% uplift that
 * corresponds to no business decision anybody made. Those percentages describe
 * how the commercial share of the price is DIVIDED UP internally, after the
 * rule of thirds has already decided how big it is.
 *
 * So there are two quite different operations here, and they must never be
 * confused:
 *
 *   thirdsPrice()  decides how much the customer pays.
 *   allocate()     divides what the customer paid into internal buckets. It
 *                  cannot change the total; the test asserts that.
 */

import { num } from './money.js';

/* ------------------------------------------------------- rule of thirds -- */

export const DEFAULT_THIRDS = {
  /** One share of CTC, one of labour+growth, one of profit+capital. */
  commercialShare: 1.0,
  profitShare: 1.0,
  /**
   * Where labour is recovered.
   *
   * 'labour-third'  labour is recovered ONCE, in the labour and growth third,
   *                 and the Cost to Company is the physical cost alone. This is
   *                 the default, and it is what stops an hour of admin on a
   *                 one-off part being multiplied by three.
   * 'ctc'           labour sits inside the Cost to Company and is tripled with
   *                 everything else. Closer to the letter of the original
   *                 specification, and much dearer on labour-heavy work.
   */
  labourIn: 'labour-third',
  /** Growth charged on top of recovered labour. Zero recovers it at cost. */
  labourUplift: 0,
  /**
   * The share of the growth passed to the customer as a saving. The growth is
   * the room left in the second tank once the actual labour is paid for; it is
   * a fair amount to charge, not a cost. Half of it is kept and half handed back
   * by default, so a quote comes in under its theoretical ceiling and the
   * customer sees the saving. The half we give away leaves the second tank
   * entirely, so the profit third - half of the first two tanks - shrinks with
   * it. Zero keeps all of it (the classic CTC x 3); one gives it all away.
   */
  growthClientShare: 0.5,
  /** Where the demand multiplier lands. */
  demandTarget: 'commercial+profit',
  minimumPartPrice: 0,
};

export const LABOUR_PLACEMENTS = [
  {
    id: 'labour-third',
    name: 'In the labour and growth third',
    hint: 'Recovered once, at cost. The Cost to Company is then the physical '
      + 'cost of the part — material, machine, electricity, hardware, scrap — '
      + 'and only that is multiplied by the thirds.',
  },
  {
    id: 'ctc',
    name: 'Inside the Cost to Company',
    hint: 'The original specification’s reading: labour is a production cost '
      + 'like any other and is tripled with them. Considerably dearer on '
      + 'anything where the work outweighs the plastic.',
  },
];

export const DEMAND_TARGETS = [
  {
    id: 'commercial+profit',
    name: 'Commercial and profit shares',
    hint: 'The recommended default. Cost recovery is untouched, so a discount '
      + 'can never take the price below what the part cost to make.',
  },
  {
    id: 'profit',
    name: 'Profit share only',
    hint: 'Sharper: the whole adjustment comes out of profit.',
  },
  {
    id: 'whole',
    name: 'The whole part price',
    hint: 'Scales cost recovery too, so at a multiplier below 1 the part can be '
      + 'sold for less than it cost. The app will warn when that happens.',
  },
];

/**
 * The normal selling price of one part.
 *
 * THE THREE FUEL TANKS. The rule of thirds is a guideline, not an identity:
 * three tanks that a part has to fill, where one may come out over and another
 * under and that is fine.
 *
 *   1. Cost to Company - everything the company must spend to make the part,
 *      EXCEPT labour. Labour is left out because an employee is usually paid by
 *      the month whether or not this part exists.
 *
 *   2. Labour + growth - nominally the same size as the first tank. If the
 *      actual labour comes to less, the rest of the tank is growth: marketing,
 *      R&D, administration. If the labour comes to MORE, the tank is simply
 *      bigger. You keep the larger number; that is the whole point of a
 *      guideline rather than a formula.
 *
 *   3. Profit + capital - half of the first two together, because those two are
 *      two thirds and this is the third one.
 *
 * The consequence worth noticing: when labour lands under a third this reduces
 * to exactly CTC x 3, the classic rule. When labour runs over, the price
 * follows the work rather than pretending the work was free.
 *
 * `ctc` is the finished Cost to Company for one part. Everything returned is
 * per part; the order-level arithmetic is engine.js's job.
 */
export function thirdsPrice(ctc, config = {}, demand = 1, labour = 0) {
  const c = { ...DEFAULT_THIRDS, ...(config || {}) };
  const cost = Math.max(0, num(ctc));
  const d = Math.max(0, num(demand, 1));

  // Labour recovered in its own tank is recovered ONCE, and is never part of
  // the Cost to Company: an hour of admin on a one-off part should be paid for,
  // not tripled.
  const labourCostAmount = c.labourIn === 'ctc' ? 0 : Math.max(0, num(labour));
  const labourRecovery = labourCostAmount * (1 + Math.max(0, num(c.labourUplift, 0)));

  /* -- tank one -------------------------------------------------------- */
  const recovery = cost;

  /* -- tank two: whichever is larger, the nominal share or the real work -- */
  const nominal = cost * Math.max(0, num(c.commercialShare, 1));
  const tankTwo = Math.max(nominal, labourRecovery);
  // Whatever the work did not fill is growth. When the work overflows the tank
  // there is no growth in it, which is a true statement about that job.
  const growth = Math.max(0, tankTwo - labourRecovery);

  // The growth is split with the customer: we keep a share and hand the rest
  // back as a saving, so the quote lands under its ceiling. The half given away
  // leaves the tank, so it is not there when the profit third is measured.
  const clientShare = Math.min(1, Math.max(0, num(c.growthClientShare, 0.5)));
  const keptGrowth = growth * (1 - clientShare);
  const savedGrowth = growth * clientShare;

  /* -- tank three: half of the first two, because they are two thirds ---- */
  const profitBase = ((recovery + labourRecovery + keptGrowth) / 2)
    * Math.max(0, num(c.profitShare, 1));

  let scaledRecovery = recovery;
  let scaledGrowth = keptGrowth;
  let scaledSaving = savedGrowth;
  let profit = profitBase;

  switch (c.demandTarget) {
    case 'profit':
      profit *= d;
      break;
    case 'whole':
      scaledRecovery *= d;
      scaledGrowth *= d;
      scaledSaving *= d;
      profit *= d;
      break;
    case 'commercial+profit':
    default:
      scaledGrowth *= d;
      scaledSaving *= d;
      profit *= d;
      break;
  }

  // Demand is commercial: it never discounts labour somebody has already done,
  // any more than it discounts the plastic.
  const price = scaledRecovery + labourRecovery + scaledGrowth + profit;
  const floor = Math.max(0, num(c.minimumPartPrice));

  // What the job really cost, whichever side of the line labour sits on.
  const trueCost = cost + labourCostAmount;

  return {
    ctc: cost,
    recovery: scaledRecovery,
    labour: labourRecovery,
    labourCost: labourCostAmount,
    labourIn: c.labourIn,
    /** Tank two as CHARGED: the work plus the growth we kept after the split. */
    labourAndGrowth: labourRecovery + scaledGrowth,
    nominalShare: nominal,
    /** True when the work overflowed its tank, so there is no growth in it. */
    labourOverflowed: labourRecovery > nominal + 1e-9,
    commercial: scaledGrowth,
    /** The growth handed back to the customer as a saving, not charged. */
    growthSaved: scaledSaving,
    growthClientShare: clientShare,
    profit,
    demand: d,
    demandTarget: c.demandTarget,
    price: Math.max(price, floor),
    priceBeforeFloor: price,
    flooredByMinimum: price < floor,
    /** True when the price no longer covers what the job actually cost. */
    belowCost: price < trueCost - 1e-9,
    trueCost,
    multiple: cost > 0 ? price / cost : 0,
    /** The honest one when labour is outside: price over what it all cost. */
    markupOnCost: trueCost > 0 ? price / trueCost : 0,
  };
}

/* ---------------------------------------------------------- allocations -- */

/**
 * How the commercial share is divided internally.
 *
 * `duplicates` names a direct cost that is ALREADY charged in the Cost to
 * Company or as an order extra. Such a bucket is still a legitimate internal
 * allocation - the company does spend money on machines - but it must never be
 * read as a second charge to the customer, and the app says so wherever it is
 * shown.
 */
export const DEFAULT_ALLOCATIONS = [
  { id: 'marketing', name: 'Marketing', weight: 0.20 },
  { id: 'rnd', name: 'R&D and prototyping', weight: 0.20 },
  { id: 'rejections', name: 'Rejections and scrap', weight: 0.10, duplicates: 'scrap' },
  { id: 'profit', name: 'Profit', weight: 0.50 },
  { id: 'admin', name: 'Admin costs', weight: 0.10 },
  { id: 'machine', name: 'Machine costs', weight: 0.15, duplicates: 'machine' },
  { id: 'labour', name: 'Labour', weight: 0.10, duplicates: 'labour' },
  { id: 'storage', name: 'Storage', weight: 0.05, duplicates: 'storage' },
  { id: 'packaging', name: 'Packaging', weight: 0.10, duplicates: 'packaging' },
  { id: 'handling', name: 'Handling', weight: 0.02, duplicates: 'handling' },
];

/**
 * Divide `amount` between the buckets in proportion to their weights.
 *
 * The weights sum to 1.52 as shipped, which is fine - they are proportions of
 * each other, not of anything else. Normalising is what stops that 1.52 ever
 * becoming a 52% markup.
 */
export function allocate(amount, buckets = DEFAULT_ALLOCATIONS, directCosts = {}) {
  const total = Math.max(0, num(amount));
  const live = (buckets || []).filter((b) => b.enabled !== false && num(b.weight) > 0);
  const weightSum = live.reduce((acc, b) => acc + num(b.weight), 0);

  const lines = live.map((bucket) => {
    const share = weightSum > 0 ? num(bucket.weight) / weightSum : 0;
    const alreadyCharged = bucket.duplicates ? num(directCosts[bucket.duplicates]) : 0;
    return {
      id: bucket.id,
      name: bucket.name,
      weight: num(bucket.weight),
      share,
      amount: total * share,
      duplicates: bucket.duplicates || null,
      alreadyCharged,
      /** True when this bucket names a cost the customer is already paying. */
      overlapsDirect: Boolean(bucket.duplicates) && alreadyCharged > 0,
    };
  });

  return {
    lines,
    total,
    weightSum,
    /** Proof, for the test and for the panel, that nothing was invented. */
    allocated: lines.reduce((acc, line) => acc + line.amount, 0),
  };
}

/** The plain-language warnings the allocation panel has to show. */
export function doubleCountWarnings(allocationResult, currency = '') {
  return allocationResult.lines
    .filter((line) => line.overlapsDirect)
    .map((line) => ({
      id: line.id,
      level: 'info',
      text: `${line.name} is already charged directly at ${currency}${line.alreadyCharged.toFixed(2)} `
        + `per part. The ${(line.weight * 100).toFixed(0)}% here is an internal share of money the `
        + 'customer has already paid, not a second charge.',
    }));
}

/* ------------------------------------------------------------ discounts -- */

export const DISCOUNT_KINDS = [
  { id: 'none', name: 'No discount' },
  { id: 'percent', name: 'Percentage off' },
  { id: 'fixed', name: 'Fixed amount off each part' },
  { id: 'volume', name: 'Quantity tier' },
  { id: 'customer', name: 'Customer price for this part' },
];

export const DEFAULT_VOLUME_TIERS = [
  { qty: 1, discount: 0 },
  { qty: 5, discount: 0.05 },
  { qty: 10, discount: 0.10 },
  { qty: 25, discount: 0.15 },
  { qty: 50, discount: 0.20 },
  { qty: 100, discount: 0.25 },
];

/**
 * The tier a quantity earns.
 *
 * Quantity ALREADY makes a part cheaper without this, because setup and
 * administration are spread across more units and more parts fit on a plate.
 * This tier is a commercial decision on top of that arithmetic, and the panel
 * says so - otherwise the saving looks like it has been counted twice.
 */
export function volumeTier(tiers, quantity) {
  const list = [...(tiers || DEFAULT_VOLUME_TIERS)].sort((a, b) => num(a.qty) - num(b.qty));
  const q = Math.max(1, Math.round(num(quantity, 1)));
  let hit = list[0] || { qty: 1, discount: 0 };
  for (const tier of list) if (q >= num(tier.qty, 1)) hit = tier;
  return { qty: num(hit.qty, 1), discount: Math.min(0.95, Math.max(0, num(hit.discount))) };
}

/**
 * The discount on one part.
 *
 * Demand has already been applied by the time this runs. The two are kept
 * separate all the way to the invoice because they answer different questions:
 * demand is about the workshop, discount is about the customer.
 */
export function applyDiscount(unitPrice, discount = {}, quantity = 1, tiers = DEFAULT_VOLUME_TIERS) {
  const price = Math.max(0, num(unitPrice));
  const kind = discount.kind || 'none';

  let rate = 0;
  let amount = 0;
  let label = 'None';

  switch (kind) {
    case 'percent':
      rate = Math.min(0.95, Math.max(0, num(discount.percent) / 100));
      amount = price * rate;
      label = `${(rate * 100).toFixed(1).replace(/\.0$/, '')}% off`;
      break;
    case 'fixed':
      amount = Math.min(price, Math.max(0, num(discount.amount)));
      rate = price > 0 ? amount / price : 0;
      label = 'Fixed amount off';
      break;
    case 'volume': {
      const tier = volumeTier(tiers, quantity);
      rate = tier.discount;
      amount = price * rate;
      label = rate > 0 ? `Quantity tier from ${tier.qty} up` : 'Below the first quantity tier';
      break;
    }
    case 'customer': {
      const agreed = Math.max(0, num(discount.unitPrice));
      amount = Math.max(0, price - agreed);
      rate = price > 0 ? amount / price : 0;
      label = 'Agreed customer price';
      break;
    }
    case 'none':
    default:
      break;
  }

  return {
    kind,
    label,
    rate,
    amount,
    unitPrice: Math.max(0, price - amount),
    before: price,
  };
}

/* ------------------------------------------ handling, storage, presets --- */

/**
 * Handling and storage are the two settings most likely to be charged twice,
 * because they appear both in the allocation list and as plausible order
 * extras. One owner for the decision: a mode.
 */
export const CHARGE_MODES = [
  {
    id: 'allocation',
    name: 'Covered by the commercial share',
    hint: 'Recommended. Nothing is added to the invoice; the cost comes out of '
      + 'money the rule of thirds has already collected.',
  },
  {
    id: 'charge',
    name: 'Charged on the order',
    hint: 'Added as a separate line. The matching allocation bucket is switched '
      + 'off so the same money is not counted twice.',
  },
];

export const DEFAULT_PRESETS = [
  {
    id: 'standard',
    name: 'Standard',
    version: 1,
    blurb: 'The company’s normal rule-of-thirds pricing.',
    thirds: { commercialShare: 1.0, profitShare: 1.0, demandTarget: 'commercial+profit' },
    demandOverride: null,
  },
  {
    id: 'startup',
    name: 'Startup',
    version: 1,
    blurb: 'Lower commercial and profit shares to win early work. Cost recovery '
      + 'is untouched, so nothing is sold below what it cost to make.',
    thirds: { commercialShare: 0.7, profitShare: 0.6, demandTarget: 'commercial+profit' },
    demandOverride: null,
  },
  {
    id: 'high-demand',
    name: 'High demand',
    version: 1,
    blurb: 'Raises the commercial share while the workshop is full.',
    thirds: { commercialShare: 1.2, profitShare: 1.3, demandTarget: 'commercial+profit' },
    demandOverride: 1.25,
  },
  {
    id: 'prototype',
    name: 'Prototype',
    version: 1,
    blurb: 'More weight on R&D and engineering time, less on profit. For '
      + 'one-off development work where the value is the learning.',
    thirds: { commercialShare: 1.4, profitShare: 0.6, demandTarget: 'commercial+profit' },
    demandOverride: null,
  },
  {
    id: 'internal',
    name: 'Internal',
    version: 1,
    blurb: 'Cost only. Used for the company’s own parts so they still appear in '
      + 'the cost figures without inventing a profit that was never made.',
    thirds: { commercialShare: 0, profitShare: 0, demandTarget: 'commercial+profit' },
    demandOverride: 1,
  },
  {
    id: 'customer-discount',
    name: 'Customer discount',
    version: 1,
    blurb: 'Standard thirds with a 10% customer discount already applied.',
    thirds: { commercialShare: 1.0, profitShare: 1.0, demandTarget: 'commercial+profit' },
    demandOverride: null,
    discount: { kind: 'percent', percent: 10 },
  },
];

export function findPreset(presets, id) {
  return presets.find((p) => p.id === id)
    || presets.find((p) => p.id === 'standard')
    || presets[0];
}
