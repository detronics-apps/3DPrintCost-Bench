/**
 * Labour operations. Pure.
 *
 * The specification is emphatic that labour is the whole workflow, not the time
 * spent watching the printer. So the default list runs from answering the
 * enquiry to filing the invoice, and every operation says what it scales with.
 *
 * `per` is the single most important field, because it is what makes ten parts
 * cost less than ten times one part without any discount being applied:
 *
 *   'order'         once for the whole order   - slicing the enquiry, invoicing
 *   'job'           once per print job         - setup, loading, unloading
 *   'extraJob'      once per plate AFTER the first - clearing the bed and
 *                   starting the next run. One plate costs nothing extra
 *   'unit'          once per part              - removal, inspection, cleaning
 *   'colourChange'  once per colour change
 *   'hardwareInsert' once per embedded component fitted
 *
 * Order and job time is amortised across the units in the order. That is the
 * real mechanism behind quantity pricing; an explicit quantity discount sits on
 * top of it and is a commercial decision, not an arithmetic one.
 */

import { num } from './money.js';

export const LABOUR_SCOPES = [
  { id: 'order', name: 'Per order', hint: 'Once for the whole order, however many parts.' },
  { id: 'job', name: 'Per print job', hint: 'Once per plate that goes on a machine.' },
  {
    id: 'extraJob',
    name: 'Per extra plate',
    hint: 'Only from the second plate onwards. One plate is one setup; every '
      + 'plate after it means coming back to clear the bed and start again.',
  },
  { id: 'unit', name: 'Per part', hint: 'Once for every part produced.' },
  {
    id: 'supportUnit',
    name: 'Per part with support',
    hint: 'Once for every part that was marked as needing its support removed. Zero on '
      + 'parts printed without support.',
  },
  {
    id: 'deburrUnit',
    name: 'Per part with cleanup',
    hint: 'Once for every part marked for deburring/cleanup in post-processing. Zero on '
      + 'a part shipped as it comes off the printer.',
  },
  { id: 'colourChange', name: 'Per colour change', hint: 'Once per manual colour change.' },
  { id: 'hardwareInsert', name: 'Per insert fitted', hint: 'Once per embedded component.' },
];

export const SCOPE_IDS = LABOUR_SCOPES.map((s) => s.id);

const op = (id, name, minutes, per, group, hint) => ({
  id, name, minutes, per, group, hint, complexity: 1, enabled: true, builtIn: true,
});

export const DEFAULT_LABOUR_OPS = [
  op('customer-admin', 'Customer and order administration', 6, 'order', 'Front office',
    'Taking the enquiry, opening the order, agreeing what is being made.'),
  op('customer-comms', 'Customer communication', 6, 'order', 'Front office',
    'The messages that happen while the job is running.'),
  op('invoice-admin', 'Invoice administration', 5, 'order', 'Front office',
    'Raising and sending the invoice, chasing payment.'),

  op('review-model', 'Reviewing the model', 8, 'job', 'Preparation',
    'Checking the geometry will print at all, and how it should be oriented.'),
  op('prepare-print', 'Preparing the print', 5, 'job', 'Preparation',
    'Arranging the plate, adding supports and brims.'),
  op('slicing', 'Slicing', 10, 'job', 'Preparation',
    'Slicing and checking the result.'),

  op('load-material', 'Loading material', 3, 'job', 'Machine',
    'Fetching the spool, purging the previous material.'),
  op('load-printer', 'Loading the printer', 3, 'job', 'Machine',
    'Clearing the bed, starting the job.'),
  op('colour-change', 'Colour change', 4, 'colourChange', 'Machine',
    'A manual change, including the purge that follows it.'),
  op('pause-hardware', 'Pausing for hardware', 1, 'hardwareInsert', 'Machine',
    'Getting to the machine and stopping it at the right layer.'),
  op('insert-hardware', 'Inserting hardware', 2, 'hardwareInsert', 'Machine',
    'Fitting the magnet, nut or insert and restarting.'),
  op('unload', 'Unloading the printer', 2, 'job', 'Machine',
    'Taking the plate off and putting the machine back to ready.'),
  op('plate-changeover', 'Changing the plate between runs', 3, 'extraJob', 'Machine',
    'Coming back to the machine, clearing the finished plate and starting the '
    + 'next run. Charged from the second plate onwards; one plate costs nothing.'),

  op('remove-part', 'Removing the part', 1.5, 'unit', 'Finishing',
    'Getting the part off the plate.'),
  op('support-removal', 'Removing support', 3, 'supportUnit', 'Finishing',
    'Cutting away and cleaning off support material. Only on parts marked as needing it.'),
  op('inspection', 'Inspection', 2, 'unit', 'Finishing',
    'Checking dimensions and surface, deciding accept or reject.'),
  // Deburring is a post-processing choice, not something every part gets: a part
  // can ship exactly as it comes off the printer. So it is scoped to the parts
  // marked for cleanup, the same way support removal is scoped to supported parts.
  op('cleaning', 'Cleaning and finishing', 2, 'deburrUnit', 'Finishing',
    'Deburring, trimming seams, wiping down. Only on parts marked for cleanup.'),

  // Packing happens whenever the order is boxed — including a collection, which
  // is still boxed for the customer to fetch. `packing` drops it only when the
  // order needs no packaging at all. Booking a courier (`shipping`) is dropped
  // when the customer collects, because nobody books one.
  { ...op('packaging', 'Packaging', 3, 'order', 'Fulfilment',
    'Boxing, padding, labelling.'), packing: true },
  { ...op('book-shipment', 'Booking the shipment', 4, 'order', 'Fulfilment',
    'Booking the courier or locker and printing the waybill.'), shipping: true },
  op('book-parts', 'Booking parts in and out', 2, 'order', 'Fulfilment',
    'Stock movements, shelf to bench to dispatch.'),
];

/**
 * The effective hourly labour rate, whichever way the workshop set it.
 *
 *   'direct'  a rate typed straight in. Zero means "use the country default".
 *   'salary'  worked out from a monthly cost of employment and the share of
 *             paid hours that are actually billable. If only 70% of a month's
 *             paid hours can be charged to jobs, the whole salary still has to
 *             be recovered over those billable hours - so the rate is
 *             monthly / (hoursPerMonth × billable), not monthly / hoursPerMonth.
 *             A person costs the same whether or not they are on a job; the
 *             billable share is how that idle time is priced back in.
 *
 * Pure, and defensive: anything that would divide by zero or price nothing falls
 * back to the country default, so a half-filled salary never yields a rate of 0.
 */
export function resolveLabourRate(labour, countryRate = 0) {
  const fallback = Math.max(0, num(countryRate));
  if (!labour || typeof labour !== 'object') return fallback;

  if (labour.rateMode === 'salary') {
    const s = labour.salary || {};
    const monthly = Math.max(0, num(s.monthly));
    const hours = Math.max(0, num(s.hoursPerMonth));
    const billable = Math.max(0, Math.min(1, num(s.billablePercent)));
    const chargeable = hours * billable;
    if (monthly > 0 && chargeable > 0) return monthly / chargeable;
    return fallback;
  }

  const direct = num(labour.rate, 0);
  return direct > 0 ? direct : fallback;
}

/**
 * Cost of labour for one order.
 *
 * Returns totals for the whole order AND per accepted unit, because the two are
 * needed on different screens and computing the second from the first in two
 * places is how they end up disagreeing.
 */
export function labourCost(ops, counts, { rate, globalComplexity = 1 } = {}) {
  const hourly = Math.max(0, num(rate));
  const quantity = Math.max(1, Math.round(num(counts.quantity, 1)));
  const jobs = Math.max(1, Math.round(num(counts.jobs, 1)));
  // Whether the order actually ships (a courier is booked) and whether it is
  // packed at all. Undefined means "yes" so existing callers are unchanged.
  const shipped = counts.shipped !== false;
  const packs = counts.packs !== false;
  const multipliers = {
    order: 1,
    job: jobs,
    // If it all fits on one plate this is zero, which is the point: the cost of
    // a second plate is a person coming back to the machine.
    extraJob: Math.max(0, jobs - 1),
    unit: quantity,
    // Support removal is per part, but only on parts that actually have support.
    supportUnit: Math.max(0, num(counts.supportUnits, 0)),
    // Deburring/cleanup is per part, but only on parts marked for it.
    deburrUnit: Math.max(0, num(counts.deburrUnits, 0)),
    colourChange: Math.max(0, num(counts.colourChanges, 0)),
    hardwareInsert: Math.max(0, num(counts.hardwareInserts, 0)),
  };

  const lines = [];
  let minutes = 0;

  for (const operation of ops) {
    if (operation.enabled === false) continue;
    // Courier booking is dropped on a collection; packing is dropped only when
    // the order needs no packaging at all.
    if (operation.shipping && !shipped) continue;
    if (operation.packing && !packs) continue;
    const scope = SCOPE_IDS.includes(operation.per) ? operation.per : 'order';
    const count = multipliers[scope];
    if (count <= 0) continue;

    const each = Math.max(0, num(operation.minutes)) * Math.max(0, num(operation.complexity, 1));
    const total = each * count * Math.max(0, num(globalComplexity, 1));
    if (total <= 0) continue;

    minutes += total;
    lines.push({
      id: operation.id,
      name: operation.name,
      group: operation.group,
      per: scope,
      count,
      minutesEach: each,
      minutes: total,
      cost: (total / 60) * hourly,
    });
  }

  const cost = (minutes / 60) * hourly;
  return {
    lines,
    rate: hourly,
    minutes,
    cost,
    minutesPerUnit: minutes / quantity,
    costPerUnit: cost / quantity,
  };
}

/** Group the lines for display without the UI having to know the groups. */
export function groupLabour(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = line.group || 'Other';
    if (!groups.has(key)) groups.set(key, { name: key, lines: [], minutes: 0, cost: 0 });
    const group = groups.get(key);
    group.lines.push(line);
    group.minutes += line.minutes;
    group.cost += line.cost;
  }
  return [...groups.values()];
}
