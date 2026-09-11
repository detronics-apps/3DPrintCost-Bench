/**
 * "How this works".
 *
 * The teaching is the product. Every panel here does the same four things:
 * says what the thing is in plain language, gives the formula, works that
 * formula through WITH THE NUMBERS CURRENTLY ON SCREEN, and names what people
 * commonly get wrong about it.
 *
 * A panel that shows a formula and not the substitution has left the reader the
 * hard half, so every entry below carries a worked line built from the live
 * result - never a made-up example.
 */

import { el } from './dom.js';
import { fmtMoney, fmtRate, num } from '../money.js';
import { ALLOWANCE_COMPONENTS } from '../settings.js';

/** One entry. `worked` is a list of `[left, right]` lines already formatted. */
export function explainCard({ title, plain, formula, worked, mistake, correction, source }) {
  return el('details', { class: 'explain' }, [
    el('summary', { class: 'explain__summary' }, [
      el('span', { text: title }),
      source ? el('span', { class: 'explain__source', text: source }) : null,
    ]),
    el('div', { class: 'explain__body' }, [
      el('p', { class: 'explain__plain', text: plain }),
      formula ? el('pre', { class: 'explain__formula value', text: formula }) : null,
      worked?.length
        ? el('dl', { class: 'explain__worked' }, worked.flatMap(([left, right]) => [
          el('dt', { text: left }),
          el('dd', { class: 'value', text: right }),
        ]))
        : null,
      mistake ? el('p', { class: 'explain__mistake' }, [
        el('strong', { text: 'Commonly got wrong: ' }),
        mistake,
      ]) : null,
      // The correction sits right under the misconception, marked green, so the
      // reader never leaves with only the wrong version in mind. A card that names
      // a mistake should always answer it.
      correction ? el('p', { class: 'explain__correction' }, [
        el('strong', { text: 'How it actually works: ' }),
        correction,
      ]) : null,
    ]),
  ]);
}

const minutes = (v) => `${Math.round(num(v))} min`;
const grams = (v) => `${num(v).toFixed(1)} g`;

/**
 * Every panel for one priced line, in the order the money is worked out.
 *
 * The order matters: read top to bottom and you have followed the chain from
 * the model to the invoice.
 */
export function explainLine(line, result, settings) {
  const code = line.currencyCode;
  const money = (v) => fmtMoney(v, code);
  const cards = [];

  const e = line.estimate;
  const level = e.level;

  cards.push(explainCard({
    title: 'Where the material and time figures come from',
    source: level.name,
    plain: `${level.blurb} The app ranks its sources: an actual production record `
      + 'beats a slicer estimate, a slicer estimate beats the app’s own geometry, '
      + 'and the app always tells you which one it used.',
    formula: 'grams = printed volume × density + supports + purge + waste\n'
      + 'minutes = volume ÷ (flow × efficiency) + layers × layer overhead',
    worked: [
      ['Model volume', `${(line.geometry.volume / 1000).toFixed(2)} cm³ solid`],
      ['Printed volume', `${(e.levels[e.method].bodyVolume / 1000).toFixed(2)} cm³ `
        + `(${(100 * e.levels[e.method].bodyVolume / Math.max(1e-9, line.geometry.volume)).toFixed(0)}% of solid)`],
      ['Part', grams(e.levels[e.method].partG)],
      ['Supports', grams(e.levels[e.method].supportG)],
      ['Purge and priming', grams(e.levels[e.method].purgeG + e.levels[e.method].primeG)],
      ...(line.detail?.changes?.used > 1
        ? [['Why that much', line.detail.changes.basis]] : []),
      ['Waste allowance', grams(e.levels[e.method].wasteG)],
      ['Total each', grams(e.grams)],
      ['Print time each', minutes(e.minutes)],
    ],
    mistake: 'Treating this as a slicer result. It is not one, unless the label '
      + 'above says Slicer or Actual. Paste the slicer’s own figures in and the '
      + 'app will use those instead — and for a multi-colour print that matters '
      + 'more than anywhere else, because how much a machine purges depends on '
      + 'the model and only the slicer knows it.',
    correction: 'The figure is the app’s best estimate from its ranked sources, and the '
      + 'label above names which one it used. It is honest about being an estimate — paste '
      + 'the slicer’s grams and minutes in and that, marked Slicer, is what the price uses.',
  }));

  if (e.timeParts?.timeAdjust && e.timeParts.timeAdjust.parts.length) {
    const adj = e.timeParts.timeAdjust;
    cards.push(explainCard({
      title: 'The print-intent time adjustment',
      source: `${line.profile.name} · ${adj.total.toFixed(2)}× time`,
      plain: 'The amount of plastic is worked out from the part’s own walls and infill, '
        + 'so it can never exceed the solid — the print intent does NOT multiply the '
        + 'material. What a profile does change is TIME: ironing, fuzzy skin, an '
        + 'iterative calibration pass and the company’s own time nudge each make the '
        + 'print take longer, and only that is applied here.',
      formula: 'quoted time = geometric print time × (finish factors × calibration × company nudge)',
      worked: [
        ...adj.parts.map((p) => [p.label, `${p.time.toFixed(2)}×`]),
        ['Combined time adjustment', `${adj.total.toFixed(2)}×`],
      ],
      mistake: 'Multiplying material by a print-intent factor. Walls and infill already '
        + 'set the plastic; multiplying again double-counts and can ask for more than the '
        + 'part can hold. Intent changes time, not material.',
      correction: 'Material comes from the geometry alone. The profile only stretches the '
        + 'time — for finish work and any calibration reprint — which the company can tune '
        + 'per profile with the time factor.',
    }));
  }

  const d = line.detail;
  cards.push(explainCard({
    title: 'The machine-hour cost',
    source: line.printer.name,
    plain: 'What an hour on this machine costs the company, worked out from what the '
      + 'machine cost and how long it will last — not from an assumption about which '
      + 'printer is expensive. Electricity is deliberately not in here; it is charged '
      + 'separately, because putting it in the rate would charge it twice.',
    formula: 'machine hour = (purchase − residual) ÷ payback hours\n'
      + '              + maintenance ÷ hours per year\n'
      + '              + parts ÷ hours per year\n'
      + '              + overhead per hour',
    worked: [
      ['Capital recovery', `${money(d.machineRate.depreciation)}/h`],
      ['Maintenance', `${money(d.machineRate.maintenance)}/h`],
      ['Replacement parts', `${money(d.machineRate.parts)}/h`],
      ['Overhead', `${money(d.machineRate.overhead)}/h`],
      ['Machine hour', `${money(d.machineRate.total)}/h`],
      ['This part uses', `${minutes(d.machineMinutes)} (heat-up shared across ${line.perPlate} on the plate)`],
      ['Machine cost', money(line.production.machine)],
    ],
    mistake: 'Assuming the cheap machine makes the cheap part. It has a lower hourly '
      + 'rate and a lower flow rate, so it takes longer — the answer is only visible at '
      + 'the finished part, which is what the printer comparison is for.',
    correction: 'Compare the finished-part cost, not the hourly rate: a slower cheap machine '
      + 'can cost more per part than a faster dear one. The printer comparison does exactly '
      + 'that sum for you.',
  }));

  cards.push(explainCard({
    title: 'Electricity',
    source: `${d.electricity.tariff.toFixed(2)} ${code}/kWh`,
    plain: 'Three consumptions that are genuinely different: bringing the machine up '
      + 'to temperature (brief and heavy), printing (long and moderate), and sitting '
      + 'idle between jobs. The heat-up is shared across everything on the plate.',
    formula: 'kWh = (watts ÷ 1000) × hours,   cost = kWh × tariff',
    worked: [
      ['Heat-up share', `${d.electricity.heatup.toFixed(3)} kWh`],
      ['Printing', `${d.electricity.printing.toFixed(3)} kWh`],
      ['Idle', `${d.electricity.idle.toFixed(3)} kWh`],
      ['Total', `${d.electricity.total.toFixed(3)} kWh`],
      ['Cost', money(line.production.electricity)],
    ],
    mistake: 'Ignoring it because it is small. It is small — and it is a real cost that '
      + 'belongs in the Cost to Company rather than being buried in a percentage.',
    correction: 'Electricity is metered as its own Cost-to-Company line — heat-up, printing '
      + 'and idle at your tariff — so it is priced explicitly on every part and never lost '
      + 'inside a percentage.',
  }));

  cards.push(explainCard({
    title: 'Labour, and why ten parts do not cost ten times one',
    source: `${money(d.labour.rate)}/h`,
    plain: 'Labour is the whole workflow, not the time spent watching the printer. Each '
      + 'operation says what it scales with: some happen once per order, some once per '
      + 'plate, some for every part. Spreading the first two across the quantity is what '
      + 'makes a batch cheaper — before any discount is applied.',
    formula: 'labour = Σ (minutes × complexity × how many times it happens) × rate ÷ 60',
    worked: [
      ['Total labour', `${minutes(d.labour.minutes)} for ${line.quantity} part${line.quantity === 1 ? '' : 's'}`],
      ['Per part', minutes(d.labour.minutesPerUnit)],
      ['Print jobs', `${line.jobs} (${line.perPlate} fit on a plate)`],
      ['Cost per part', money(line.production.labour)],
    ],
    mistake: 'Charging only the print-watching time. The enquiry, the slicing, the '
      + 'inspection and the invoice are all real hours somebody worked.',
    correction: 'Labour is costed as the whole workflow — enquiry, slicing, inspection, '
      + 'invoicing — with each operation scaled by how often it happens, so the real hours '
      + 'are recovered exactly once and a batch spreads the one-off ones.',
  }));

  cards.push(explainCard({
    title: 'Scrap and rejection',
    source: d.scrap.mode,
    plain: `Scrap is priced as attempts per accepted part, based on ${d.scrap.basis}. `
      + 'A 10% rejection rate does not add 10% to the cost — it means you have to start '
      + '1 ÷ 0.9 parts to finish one, which is 11.1% more.',
    formula: 'attempts per accepted = 1 ÷ ((1 − print failure) × (1 − insertion failure))',
    worked: [
      ['Print failure rate', fmtRate(d.scrap.rate)],
      ...(d.scrap.hardwareFailure > 0
        ? [['Insertion failure rate', fmtRate(d.scrap.hardwareFailure)]] : []),
      ['Attempts per good part', d.scrap.attempts.toFixed(3)],
      ['Costs at risk', money(line.production.direct - d.labourSafe)],
      ['Scrap allowance', money(line.production.scrapAllowance)],
    ],
    mistake: 'Applying the scrap rate to the invoicing time as well. A failed print '
      + 'wastes the plastic and the machine hours; it does not make you raise the '
      + 'invoice twice, so order-scope labour is left out of the allowance.',
    correction: 'Only the at-risk costs — plastic and machine hours — carry the scrap '
      + 'allowance, priced as attempts per good part; order-scope labour is excluded, so a '
      + 'reprint is never billed as a second invoice.',
  }));

  // The general allowance broken into the categories it covers, each a slice of
  // the actual allowance so they sum to it exactly (and to nothing when a
  // company-internal order has dropped the allowance).
  const allowComps = settings.ctc?.allowanceComponents || {};
  const allowRateSum = ALLOWANCE_COMPONENTS.reduce((t, c) => t + num(allowComps[c.id]), 0);
  const allowanceLines = allowRateSum > 0
    ? ALLOWANCE_COMPONENTS.map((c) => [`  ${c.name}`,
      money(line.production.generalAllowance * num(allowComps[c.id]) / allowRateSum)])
    : [];

  cards.push(explainCard({
    title: 'Cost to Company',
    source: `allowance ${fmtRate(line.production.allowanceRate)}`,
    plain: 'Everything the part actually costs to make, plus a general allowance for the '
      + 'commercial costs the price does not itemise anywhere else — marketing, admin, R&D '
      + 'and storage. This is the number the rule of thirds works from, and it contains no '
      + 'shipping, no packaging and no profit.',
    formula: 'CTC = (material + machine + electricity + labour + hardware + other + scrap) '
      + '× (1 + allowance)\nallowance = marketing + admin + R&D + storage',
    worked: [
      ['Material', money(line.production.material)],
      ['Machine', money(line.production.machine)],
      ['Electricity', money(line.production.electricity)],
      ['Labour', money(line.production.labour)],
      ['Hardware', money(line.production.hardware)],
      ['Other direct', money(line.production.other)],
      ['Scrap allowance', money(line.production.scrapAllowance)],
      ['Production cost', money(line.production.total)],
      [`General allowance at ${fmtRate(line.production.allowanceRate)}`, money(line.production.generalAllowance)],
      ...allowanceLines,
      ['Cost to Company', money(line.ctc)],
    ],
    mistake: 'Putting shipping in here. Shipping is money the customer is passed for '
      + 'moving a box; it does not change what the part cost to make, and the app will '
      + 'not let it into this number.',
    correction: 'Cost to Company is production only — material, machine, electricity, labour, '
      + 'hardware, scrap, plus the general allowance. Shipping is a fulfilment extra added '
      + 'after the part price, never inside CTC.',
  }));

  const p = line.price;
  cards.push(explainCard({
    title: 'The rule of thirds',
    source: p.demand === 1 ? 'demand 1.00×' : `demand ${p.demand.toFixed(2)}×`,
    plain: p.labour > 0
      ? 'The Cost to Company is the PHYSICAL cost of the part — material, machine, '
        + 'electricity, hardware, scrap — and that is what the thirds multiply. The '
        + 'labour is recovered separately and exactly once, because an hour of '
        + 'admin on a one-off part should be paid for, not tripled. Change where '
        + 'labour sits in Settings → Pricing.'
      : 'One third pays back what the part cost. One third covers labour recovery, '
        + 'marketing, R&D and administration. One third is profit and capital — loan '
        + 'repayments, the next machine, retained earnings. That is why the normal '
        + 'price is three times the Cost to Company.',
    formula: p.labour > 0
      ? 'part price = CTC + labour + (CTC × commercial × demand) + (CTC × profit × demand)'
      : 'part price = CTC + (CTC × commercial share × demand) + (CTC × profit share × demand)',
    worked: [
      ['Cost to Company', money(p.ctc)],
      ...(p.labour > 0 ? [
        ['Labour, recovered once', money(p.labour)],
        ['What the job actually cost', money(p.trueCost)],
      ] : []),
      ['Cost recovery', money(p.recovery)],
      [`${p.labour > 0 ? 'Growth' : 'Labour + growth'} (${settings.thirds.commercialShare}× share)`, money(p.commercial)],
      [`Profit + capital (${settings.thirds.profitShare}× share)`, money(p.profit)],
      ['Part price', money(p.price)],
      [p.labour > 0 ? 'Over what it cost' : 'Multiple of cost',
        `${(p.labour > 0 ? p.markupOnCost : p.multiple).toFixed(2)}×`],
    ],
    mistake: 'Adding the company allocation percentages on top of this. Marketing 20%, '
      + 'R&D 20%, profit 50% and the rest divide up the two commercial thirds you have '
      + 'already charged. Adding them would make a 152% markup nobody decided on.',
    correction: 'The allocation only DIVIDES the two commercial thirds you have already '
      + 'charged — it is a breakdown of that money, not an addition to it. The part price is '
      + 'exactly CTC plus those thirds (plus recovered labour); nothing else is stacked on top.',
  }));

  if (result) {
    cards.push(explainCard({
      title: 'Demand',
      source: result.demand.mode,
      plain: result.demand.reason + ' Demand is a commercial lever: it moves the '
        + 'price and never the cost. Material, electricity and machine time are '
        + 'identical whether the workshop is empty or full.',
      formula: 'commercial and profit shares × demand multiplier  (cost recovery untouched)',
      worked: [
        ['Multiplier', `${result.demand.multiplier.toFixed(2)}×`],
        ...(result.demand.utilisation != null
          ? [['Workshop committed', fmtRate(result.demand.utilisation)]] : []),
        ['Applied to', settings.thirds.demandTarget === 'whole'
          ? 'the whole part price' : 'the commercial and profit shares'],
      ],
      mistake: 'Pointing demand at the whole price. Below 1.00× that discounts your own '
        + 'cost recovery, and the part sells for less than it cost to make.',
      correction: 'Demand moves only the commercial and profit shares, never cost recovery, '
        + 'so a quiet-workshop discount can thin the margin but never sell the part below '
        + 'what it cost to make.',
    }));
  }

  return cards;
}

/** The order-level panels: extras, free shipping, allocation and the invoice. */
export function explainOrder(result, settings) {
  const code = result.currencyCode;
  const money = (v) => fmtMoney(v, code);
  const cards = [];

  cards.push(explainCard({
    title: 'What sits outside the thirds',
    source: 'Order extras',
    plain: 'Packaging, shipping, handling and any service the customer selected are '
      + 'fulfilment costs. They are added after the part price and take no part in the '
      + 'thirds calculation — a R90 delivery does not make the part cost more to make, '
      + 'and it must not be multiplied by three.',
    formula: 'invoice = part price + packaging + shipping + extras − discount + tax',
    worked: [
      ['Parts', money(result.parts.total)],
      ['Packaging', money(result.orderExtras.packaging)],
      [result.shipping.free ? 'Shipping (free)' : 'Shipping', money(result.orderExtras.shipping)],
      ...(result.orderExtras.handling ? [['Handling', money(result.orderExtras.handling)]] : []),
      ...(result.orderExtras.storage ? [['Storage', money(result.orderExtras.storage)]] : []),
      ...result.orderExtras.extras.map((x) => [x.name, money(x.amount)]),
      ['Net', money(result.totals.net)],
      ...(result.tax.tax ? [[`${settings.tax.name}`, money(result.tax.tax)]] : []),
      ['Invoice total', money(result.totals.finalInvoice)],
    ],
    mistake: 'Letting the shipping charge count towards free shipping. The threshold is '
      + 'measured on the part value, or a R820 order plus R90 shipping would qualify for '
      + 'free shipping on the strength of the shipping.',
    correction: 'Free shipping is judged on the part value alone, so a courier charge can '
      + 'never tip an order over the threshold on the strength of the courier charge.',
  }));

  const free = result.shipping.freeRule;
  cards.push(explainCard({
    title: 'Free shipping',
    source: free.free ? 'Earned' : 'Not earned',
    plain: free.reason + ' The threshold is measured against the part selling value, '
      + 'not the invoice total.',
    formula: 'free when part value ≥ threshold',
    worked: [
      ['Threshold', money(free.threshold)],
      ['Measured', money(free.measured)],
      ['Shipping would be', money(result.orderExtras.shippingBeforeFree)],
      ['Shipping charged', money(result.orderExtras.shipping)],
    ],
    mistake: 'Setting the threshold below three times your typical cost. At CTC × 3 a '
      + `${money(free.threshold)} threshold is a part costing ${money(free.threshold / 3)} to make.`,
    correction: 'Set the threshold at roughly three times a typical part’s Cost to Company, '
      + 'so free shipping is only ever earned on an order whose margin can absorb the courier.',
  }));

  const alloc = result.allocation;
  cards.push(explainCard({
    title: 'Where the money in this order goes',
    source: `${money(alloc.adjustedTotal)} across the categories`,
    plain: 'Each category shows the amount already worked out for it in this order. The '
      + 'weight dials it: 10 leaves it as calculated, 11 adds 10% of that category to the '
      + 'price, 9 takes 10% off. So at weight 10 across the board the price is exactly the '
      + 'calculated total — the categories only move it when a weight leaves 10.',
    formula: 'adjusted = calculated × (weight ÷ 10)\n'
      + 'added to the price = (built-in) calculated × (weight − 10) ÷ 10;  (custom) the whole adjusted amount',
    worked: [
      ...alloc.lines.map((line) => [
        `${line.name} · weight ${line.weight}${line.custom ? ' (custom)' : ''}`,
        money(line.adjusted),
      ]),
      ['Added to the client price', money(alloc.addToPrice)],
    ],
    mistake: 'Treating a built-in category’s whole amount as extra on top. Machine, labour, '
      + 'profit and the rest are already in the price — only the change from weight 10 is '
      + 'added or removed. A custom category is the exception: it is new money.',
    correction: 'Leave a category at weight 10 to charge it exactly as calculated. Move it to '
      + 'add or shave a percentage, and add a custom category for anything new you want set aside.',
  }));

  return cards;
}

/** The equation summary: every formula the app uses, gathered in one place. */
export function equationSummary() {
  const rows = [
    ['Material cost', 'grams × price per gram', 'Price per gram comes from the spool price in your own country. There is no exchange rate in this app.'],
    ['Machine hour', '(purchase − residual) ÷ lifetime hours + maintenance ÷ hours per year + parts ÷ hours per year + overhead', 'Electricity is not in here. It is charged separately so it cannot be charged twice.'],
    ['Electricity', '(watts ÷ 1000) × hours × tariff', 'The heat-up is shared across everything on the plate.'],
    ['Labour', 'Σ (minutes × complexity × occurrences) × rate ÷ 60', 'Order and job time divided by the quantity is what makes a batch cheaper.'],
    ['Scrap', 'attempts = 1 ÷ (1 − rejection rate)', 'Not "add the rejection rate". 10% scrap costs 11.1% more, not 10%.'],
    ['Cost to Company', '(direct + scrap) × (1 + general allowance)', 'Contains no shipping, no packaging and no profit.'],
    ['Part price', 'CTC + CTC × commercial × demand + CTC × profit × demand', 'Three equal thirds at the default settings, so CTC × 3.'],
    ['Allocation', 'bucket = commercial share × weight ÷ Σ weights', 'A division of money already charged, never an addition to it.'],
    ['Invoice', 'parts + packaging + shipping + extras − discount, then tax', 'Extras are outside the thirds.'],
    ['Free shipping', 'part value ≥ threshold', 'Part value, not invoice total.'],
  ];

  return el('div', { class: 'equations' }, rows.map(([name, formula, note]) => el('div', { class: 'equation' }, [
    el('div', { class: 'equation__name', text: name }),
    el('pre', { class: 'equation__formula value', text: formula }),
    el('div', { class: 'equation__note', text: note }),
  ])));
}
