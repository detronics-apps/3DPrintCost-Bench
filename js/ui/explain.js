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

/** One entry. `worked` is a list of `[left, right]` lines already formatted. */
export function explainCard({ title, plain, formula, worked, mistake, source }) {
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
  }));

  if (e.levels.empirical && e.levels.geometric) {
    const ratio = e.disagreement;
    cards.push(explainCard({
      title: 'The empirical print-intent factors, and why they are not used directly',
      source: `${line.profile.name} · ${e.empiricalVolume.factor.toFixed(2)}× material`,
      plain: 'Your measured factors say this profile uses '
        + `${e.empiricalVolume.factor.toFixed(2)}× the material of Display Only. `
        + 'Those factors multiply the wall effect by the infill effect, and walls and '
        + 'infill fill the same interior — so multiplied together they count that '
        + 'interior twice. On this part they ask for '
        + `${(e.empiricalVolume.raw / 1000).toFixed(1)} cm³ in a part whose solid volume `
        + `is ${(line.geometry.volume / 1000).toFixed(1)} cm³.`,
      formula: 'empirical = Display Only baseline × published factor  (held at solid volume)\n'
        + 'geometric = shell + top/bottom skin + infill, from the settings themselves',
      worked: [
        ['Display Only baseline', `${(e.empiricalVolume.baseline / 1000).toFixed(2)} cm³`],
        ['Published factor', `${e.empiricalVolume.factor.toFixed(2)}×`],
        ['Empirical asks for', `${(e.empiricalVolume.raw / 1000).toFixed(2)} cm³`],
        ['Solid volume of the part', `${(line.geometry.volume / 1000).toFixed(2)} cm³`],
        ['Held at', `${(e.empiricalVolume.total / 1000).toFixed(2)} cm³`],
        ['Geometric estimate', `${(e.geometryVolume.total / 1000).toFixed(2)} cm³`],
        ['They disagree by', `${ratio.toFixed(2)}×`],
      ],
      mistake: 'Reading the factor table as physics. It is calibration data from one '
        + 'part. Record a few real prints and the app will learn a correction from your '
        + 'own machines, which is what the factors were reaching for.',
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
  }));

  cards.push(explainCard({
    title: 'Cost to Company',
    source: `allowance ${fmtRate(line.production.allowanceRate)}`,
    plain: 'Everything the part actually costs to make, plus a configurable general '
      + 'allowance for the small direct costs nobody itemises. This is the number the '
      + 'rule of thirds works from, and it contains no shipping, no packaging and no '
      + 'profit.',
    formula: 'CTC = (material + machine + electricity + labour + hardware + other + scrap) '
      + '× (1 + allowance)',
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
      ['Cost to Company', money(line.ctc)],
    ],
    mistake: 'Putting shipping in here. Shipping is money the customer is passed for '
      + 'moving a box; it does not change what the part cost to make, and the app will '
      + 'not let it into this number.',
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
  }));

  const alloc = result.allocation;
  cards.push(explainCard({
    title: 'Where the commercial share goes',
    source: `${money(alloc.total)} to divide`,
    plain: 'These percentages divide up the two commercial thirds you have already '
      + 'charged. They are proportions of each other, so they are normalised — the '
      + 'shipped weights add to 152% and that is fine, because they are not percentages '
      + 'of the invoice.',
    formula: 'each bucket = commercial share × (its weight ÷ total weight)',
    worked: [
      ...alloc.lines.map((line) => [
        `${line.name}${line.overlapsDirect ? ' (already charged directly)' : ''}`,
        money(line.amount),
      ]),
      ['Total allocated', money(alloc.allocated)],
    ],
    mistake: 'Reading a bucket that names a direct cost — machine, labour, packaging — '
      + 'as a second charge. Those are internal shares of money the customer has already '
      + 'paid once. The app marks each one.',
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
