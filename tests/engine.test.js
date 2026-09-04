import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFromCosts, calculateLine, calculateOrder, comparePrinters, scrapModel,
  assertSeparation,
} from '../js/engine.js';
import { defaultSettings, applyPreset, applyCountry, migrateSettings, nextNumber, clone } from '../js/settings.js';
import { round } from '../js/money.js';
import { machineHourCost, byMachineHourCost } from '../js/printers.js';
import { thirdsPrice, allocate, DEFAULT_ALLOCATIONS, applyDiscount, volumeTier } from '../js/pricing.js';
import { demandMultiplier, utilisation, bandFor } from '../js/demand.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

const settings = () => {
  const s = defaultSettings();
  s.scrap.rate = 0;                 // the specification's example has no scrap
  return s;
};

/* ---------------------------------------- the specification's own example -- */

test('section 50 reproduces exactly, to the cent', () => {
  const s = settings();
  s.thirds.growthClientShare = 0; // the spec's numbers predate the growth split
  const r = calculateFromCosts({
    material: 4, machine: 2, electricity: 0.5, labour: 1, hardware: 1, other: 0.5,
  }, s, { shippingOverride: 90 });

  assert.equal(round(r.directTotal), 9);
  assert.equal(round(r.generalAllowance), 0.9);
  assert.equal(round(r.ctc), 9.9);
  assert.equal(round(r.price.recovery), 9.9);
  assert.equal(round(r.price.commercial), 9.9);
  assert.equal(round(r.price.profit), 9.9);
  assert.equal(round(r.price.price), 29.7);
  assert.equal(round(r.shipping), 90);
  assert.equal(round(r.finalInvoice), 119.7);
});

test('section 1: the R10 CTC example, shipping outside the thirds', () => {
  const s = settings();
  s.ctc.generalAllowance = 0;
  s.thirds.growthClientShare = 0; // the spec's numbers predate the growth split
  const r = calculateFromCosts({ material: 10 }, s, { shippingOverride: 90 });
  assert.equal(round(r.ctc), 10);
  assert.equal(round(r.price.price), 30);
  assert.equal(round(r.finalInvoice), 120);
  // The R90 must not have touched the CTC or the thirds.
  assert.equal(round(r.price.recovery), 10);
  assert.equal(round(r.price.commercial + r.price.profit), 20);
});

test('section 22: free shipping is measured on the part value, not the invoice', () => {
  const s = settings();
  s.ctc.generalAllowance = 0;
  s.thirds.growthClientShare = 0; // exact price threshold, before the growth split
  s.freeShipping = { enabled: true, threshold: 900, appliesTo: 'after', basis: 'order' };

  const at900 = calculateFromCosts({ material: 300 }, s, { shippingOverride: 90 });
  assert.equal(round(at900.price.price), 900);
  assert.equal(at900.freeShipping.free, true);
  assert.equal(round(at900.finalInvoice), 900);

  // R820 of parts plus R90 shipping is R910 on the invoice, and must NOT
  // qualify: the shipping charge cannot help pay for itself.
  const below = calculateFromCosts({ material: 273.33 }, s, { shippingOverride: 90 });
  assert.ok(below.price.price < 900);
  assert.equal(below.freeShipping.free, false);
  assert.equal(round(below.finalInvoice), round(below.parts + 90));
});

test('section 26: demand moves the price and never the cost', () => {
  const s = settings();
  s.ctc.generalAllowance = 0;
  s.thirds.growthClientShare = 0; // exact demand arithmetic, before the growth split

  const normal = calculateFromCosts({ material: 100 }, s, { demand: 1, shippingOverride: 0 });
  const quiet = calculateFromCosts({ material: 100 }, s, { demand: 0.8, shippingOverride: 0 });
  const busy = calculateFromCosts({ material: 100 }, s, { demand: 1.2, shippingOverride: 0 });

  assert.equal(round(normal.ctc), 100);
  assert.equal(round(quiet.ctc), 100, 'CTC must not move with demand');
  assert.equal(round(busy.ctc), 100, 'CTC must not move with demand');

  assert.equal(round(normal.price.price), 300);
  assert.equal(round(quiet.price.price), 260);   // 100 + 80 + 80
  assert.equal(round(busy.price.price), 340);    // 100 + 120 + 120
  assert.equal(quiet.price.belowCost, false, 'cost recovery is never discounted');
});

test('section 51: the allocation percentages are never a markup', () => {
  const weights = DEFAULT_ALLOCATIONS.reduce((t, b) => t + b.weight, 0);
  close(weights, 1.52, 1e-9, 'the shipped weights');

  const result = allocate(200, DEFAULT_ALLOCATIONS, {});
  // The forbidden reading would be 200 x 1.52 = 304.
  close(result.allocated, 200, 1e-9, 'allocation cannot invent money');
  assert.notEqual(round(result.allocated), 304);
});

test('an allocation bucket that duplicates a direct cost is flagged, not removed', () => {
  const result = allocate(100, DEFAULT_ALLOCATIONS, { machine: 2.1, labour: 4, packaging: 1 });
  const machine = result.lines.find((l) => l.id === 'machine');
  assert.equal(machine.overlapsDirect, true);
  assert.equal(machine.alreadyCharged, 2.1);
  const marketing = result.lines.find((l) => l.id === 'marketing');
  assert.equal(marketing.overlapsDirect, false);
  close(result.allocated, 100, 1e-9, 'flagging must not change the total');
});

/* ------------------------------------------------------- machine economics -- */

test('section 10: the printer ranking is a result, not a hard-coded order', () => {
  const s = settings();
  const ranked = byMachineHourCost(s.printers).map((p) => p.id);
  assert.deepEqual(ranked, ['ender-3', 'snapmaker-u1', 'bambu-x1e']);

  // Now make the Ender the expensive machine. If the order were hard-coded
  // anywhere, this would not move.
  const edited = clone(s);
  edited.printers.find((p) => p.id === 'ender-3').purchasePrice = 500000;
  const reranked = byMachineHourCost(edited.printers).map((p) => p.id);
  assert.equal(reranked[reranked.length - 1], 'ender-3');
});

test('machine-hour cost is four named parts that add up', () => {
  const s = settings();
  for (const printer of s.printers) {
    const c = machineHourCost(printer);
    close(c.depreciation + c.maintenance + c.parts + c.overhead, c.total, 1e-9, printer.id);
    assert.ok(c.total > 0 && Number.isFinite(c.total), printer.id);
  }
});

test('electricity is not inside the machine rate, so it cannot be charged twice', () => {
  const s = settings();
  const printer = s.printers[0];
  const doubled = clone(printer);
  doubled.powerW *= 10;
  close(machineHourCost(doubled).total, machineHourCost(printer).total, 1e-9,
    'power must not affect the machine rate');
});

/* ------------------------------------------------------------------ scrap -- */

test('scrap is priced as attempts per accepted part, not as a flat uplift', () => {
  const s = settings();
  s.scrap = { mode: 'percent', rate: 0.10, minimumSamples: 10 };
  const model = scrapModel(s, s.printers[0], 0);
  close(model.attempts, 1 / 0.9, 1e-9, '10% scrap');

  // 10% scrap means ten parts cost eleven-and-a-bit attempts, not ten plus 10%.
  assert.ok(model.attempts > 1.1);
});

test('historical scrap only takes over once there is enough of it', () => {
  const s = settings();
  s.scrap = { mode: 'historical', rate: 0.10, minimumSamples: 10 };
  const thin = scrapModel(s, s.printers[0], 0, { attempts: 3, rejected: 3 });
  close(thin.rate, 0.10, 1e-9, 'three prints is not evidence');

  const thick = scrapModel(s, s.printers[0], 0, { attempts: 40, rejected: 2 });
  close(thick.rate, 0.05, 1e-9, 'forty prints is');
});

test('hardware insertion failure compounds with print failure', () => {
  const s = settings();
  s.scrap = { mode: 'percent', rate: 0.10 };
  const model = scrapModel(s, s.printers[0], 0.02);
  close(model.attempts, 1 / (0.9 * 0.98), 1e-9, 'compounded survival');
});

/* -------------------------------------------------------------- one line -- */

const bracket = () => ({
  quantity: 1,
  profileId: 'function',
  printerId: 'bambu-x1e',
  materialId: 'petg-dark-grey',
  geometry: analyse(box(50, 50, 20)),
  hardware: [],
  colours: 1,
});

test('a real line produces finite, ordered numbers all the way down', () => {
  const s = settings();
  const line = calculateLine(bracket(), s);

  for (const [key, value] of Object.entries(line.production)) {
    if (typeof value !== 'number') continue;
    assert.ok(Number.isFinite(value), `production.${key} is ${value}`);
    assert.ok(value >= 0, `production.${key} is negative`);
  }
  assert.ok(line.ctc > line.production.total, 'the allowance must raise the CTC');
  assert.ok(line.price.price > line.production.trueCost,
    'the part must sell for more than the job actually cost');
  // Three tanks: the Cost to Company, then whichever is larger of the nominal
  // share and the real work, then half of those two together.
  const tankTwo = Math.max(line.ctc, line.price.labour);
  close(line.price.price, line.ctc + tankTwo + (line.ctc + tankTwo) / 2, 1e-6,
    'the rule of thirds');
  assert.ok(line.estimate.grams > 0 && line.estimate.grams < 90,
    `a 50x50x20 PETG bracket at 30% infill weighed ${line.estimate.grams} g`);
});

test('the empirical factors are shown but cannot produce an impossible part', () => {
  const s = settings();
  const line = calculateLine({ ...bracket(), profileId: 'extra-strong' }, s);

  const solidVolume = line.geometry.volume;
  assert.ok(line.estimate.empiricalVolume.clamped,
    'on a real part the published factors exceed solid, and that must be detected');
  assert.ok(line.estimate.levels.empirical.bodyVolume <= solidVolume * 1.021,
    'the clamp must hold at the solid volume');
  assert.ok(line.notes.some((n) => /solid volume/.test(n.text)),
    'the clamp must be reported, not silent');

  // The geometric estimate is the one used for quoting, and it is physical.
  assert.ok(line.estimate.levels.geometric.bodyVolume <= solidVolume * 1.021);
  assert.equal(line.estimate.method, 'geometric');
});

test('a slicer estimate outranks the app’s own geometry', () => {
  const s = settings();
  const line = calculateLine({ ...bracket(), slicer: { grams: 41.5, minutes: 96 } }, s);
  assert.equal(line.estimate.method, 'slicer');
  close(line.estimate.minutes, 96, 1e-9, 'slicer minutes');
  assert.ok(line.estimate.grams > 41.5, 'waste is still added on top of the slicer figure');
});

test('an actual production record outranks the slicer', () => {
  const s = settings();
  const line = calculateLine({
    ...bracket(),
    slicer: { grams: 41.5, minutes: 96 },
    actual: { grams: 44.2, minutes: 112 },
  }, s);
  assert.equal(line.estimate.method, 'actual');
  close(line.estimate.grams, 44.2, 1e-9, 'actual grams');
});

test('a part too big for the machine is refused loudly', () => {
  const s = settings();
  const line = calculateLine({
    ...bracket(),
    geometry: analyse(box(400, 400, 400)),
  }, s);
  assert.equal(line.fit.fits, false);
  assert.ok(line.notes.some((n) => n.level === 'danger' && /build volume/.test(n.text)));
});

test('quantity makes a part cheaper without any discount being applied', () => {
  const s = settings();
  s.discount = { kind: 'none' };
  const one = calculateLine({ ...bracket(), quantity: 1 }, s);
  const fifty = calculateLine({ ...bracket(), quantity: 50 }, s);

  assert.ok(fifty.ctc < one.ctc,
    `50 off should cost less each (${fifty.ctc} vs ${one.ctc})`);
  assert.equal(fifty.discount.kind, 'none', 'and it must not be a discount doing it');
  assert.ok(fifty.jobs > 1, 'fifty parts do not fit on one plate');
});

test('every warning level a line emits is one the banner styles honour', () => {
  // pitfalls #15: an unrecognised level renders as a neutral note in silence.
  const honoured = new Set(['info', 'ok', 'warn', 'danger']);
  const s = settings();
  const cases = [
    bracket(),
    { ...bracket(), profileId: 'extra-strong' },
    { ...bracket(), geometry: analyse(box(400, 400, 400)) },
    { ...bracket(), colours: 6 },
    { ...bracket(), slicer: { grams: 40, minutes: 90 } },
  ];
  for (const line of cases) {
    for (const n of calculateLine(line, s).notes) {
      assert.ok(honoured.has(n.level), `note level "${n.level}" falls back in silence`);
    }
  }
});

/* ------------------------------------------------------------ whole order -- */

test('the order separates production, part price and extras', () => {
  const s = settings();
  const order = {
    lines: [{ ...bracket(), quantity: 4 }],
    shippingMethodId: 'pudo-s',
  };
  const r = calculateOrder(order, s);

  assert.equal(r.separation.ok, true);
  close(r.parts.total, r.lines[0].lineTotal, 1e-9, 'parts total');
  close(
    r.totals.net,
    r.parts.total + r.orderExtras.total,
    1e-9,
    'net = parts + extras, nothing else',
  );
  assert.ok(r.orderExtras.shipping > 0);
  assert.ok(r.totals.costToCompany < r.totals.partPrice);
  assert.ok(r.totals.partPrice < r.totals.finalInvoice);
});

test('shipping never enters the Cost to Company', () => {
  const s = settings();
  const base = { lines: [{ ...bracket(), quantity: 2 }] };

  // Two couriers: both ship, so the part is made and packed identically. Only
  // the shipping charge differs, and that sits outside the thirds.
  const cheap = calculateOrder({ ...base, shippingMethodId: 'pudo-s' }, s);
  const dear = calculateOrder({ ...base, shippingMethodId: 'express-za' }, s);

  close(cheap.totals.costToCompany, dear.totals.costToCompany, 1e-9,
    'CTC must be identical whatever the shipping');
  close(cheap.parts.total, dear.parts.total, 1e-9,
    'the part price must be identical whatever the shipping');
  assert.ok(dear.totals.finalInvoice > cheap.totals.finalInvoice);
});

test('collection drops the packing and courier-booking labour', () => {
  const s = settings();
  const base = { lines: [{ ...bracket(), quantity: 2 }] };

  const collected = calculateOrder({ ...base, shippingMethodId: 'collect' }, s);
  const shipped = calculateOrder({ ...base, shippingMethodId: 'express-za' }, s);

  // Labour is recovered outside the CTC by default, so collection cannot change
  // what the part cost to company...
  close(collected.totals.costToCompany, shipped.totals.costToCompany, 1e-9,
    'collection must not change the Cost to Company');
  // ...but nobody boxes or books a collected order, so its labour - and the true
  // cost that carries it - is strictly lower.
  assert.ok(collected.totals.trueCost < shipped.totals.trueCost,
    'a collected order carries less labour than one that ships');
  // And the same holds when the "customer collects" toggle is used instead of
  // the collection delivery method.
  const toggled = calculateOrder({ ...base, packagingCollected: true }, s);
  assert.ok(toggled.totals.trueCost < shipped.totals.trueCost,
    'the "customer collects" toggle drops the same labour');
});

test('VAT is added once, at the end, over everything', () => {
  const s = settings();
  s.tax = { enabled: true, rate: 0.15, name: 'VAT', inclusive: false };
  const r = calculateOrder({ lines: [{ ...bracket() }], shippingMethodId: 'pudo-s' }, s);
  close(r.totals.gross, r.totals.net * 1.15, 1e-6, 'gross');
  close(r.tax.tax, r.totals.net * 0.15, 1e-6, 'tax');
});

test('handling charged on the order switches off its allocation bucket', () => {
  const s = settings();
  const order = { lines: [{ ...bracket(), quantity: 3 }], shippingMethodId: 'collect' };

  const allocated = calculateOrder(order, s);
  assert.equal(allocated.orderExtras.handling, 0);
  assert.ok(allocated.allocation.lines.some((l) => l.id === 'handling'));

  const chargedSettings = clone(s);
  chargedSettings.handling = { mode: 'charge', rate: 0.02 };
  const charged = calculateOrder(order, chargedSettings);
  assert.ok(charged.orderExtras.handling > 0);
  assert.ok(!charged.allocation.lines.some((l) => l.id === 'handling'),
    'the bucket must be gone once the money is charged directly');
});

test('an order with no lines does not produce NaN anywhere', () => {
  const s = settings();
  const r = calculateOrder({ lines: [] }, s);
  const walk = (value, path) => {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${path} is ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(r.totals, 'totals');
  walk(r.parts, 'parts');
  walk(r.orderExtras, 'orderExtras');
});

/* -------------------------------------------------------- printer choice -- */

test('section 37: the cheap machine is not automatically the cheap part', () => {
  const s = settings();
  const comparison = comparePrinters({ ...bracket(), materialId: 'pla-dark-grey' }, s);
  assert.equal(comparison.length, s.printers.length);

  const ender = comparison.find((c) => c.printer.id === 'ender-3');
  const bambu = comparison.find((c) => c.printer.id === 'bambu-x1e');

  assert.ok(machineHourCost(ender.printer).total < machineHourCost(bambu.printer).total,
    'the Ender must have the cheaper hour');
  assert.ok(ender.minutes > bambu.minutes,
    'and it must take longer, because its flow rate is lower');
  // Whichever wins, it has to be a computed answer with both effects in it.
  assert.ok(Number.isFinite(ender.ctc) && Number.isFinite(bambu.ctc));
});

test('a machine that cannot run the material is marked blocked, not merely dear', () => {
  const s = settings();
  const comparison = comparePrinters({ ...bracket(), materialId: 'pc-clear' }, s);
  const ender = comparison.find((c) => c.printer.id === 'ender-3');
  assert.equal(ender.supports, false);
  assert.equal(ender.blocked, true);
  assert.equal(comparison[comparison.length - 1].blocked, true, 'blocked machines sort last');
});

/* ------------------------------------------------------------- settings -- */

test('settings from an unknown future or ancient past still load', () => {
  const fresh = migrateSettings(null);
  assert.equal(fresh.version, 1);
  assert.ok(fresh.printers.length >= 3);

  // A literal old-format blob, not a freshly generated one (pitfalls #8).
  const ancient = { markupPercent: 200, countryId: 'ZA', company: { name: 'Old shop' } };
  const migrated = migrateSettings(ancient);
  assert.equal(migrated.company.name, 'Old shop');
  assert.equal(migrated.markupPercent, undefined);
  close(migrated.thirds.commercialShare + migrated.thirds.profitShare, 2, 1e-9,
    'a 200% markup becomes two commercial shares');
});

test('a stored key explicitly set to undefined does not wipe its default', () => {
  const migrated = migrateSettings({ version: 1, ctc: { generalAllowance: undefined } });
  close(migrated.ctc.generalAllowance, 0.1, 1e-9, 'the default survives');
});

test('a workshop’s own catalogue entries and edits survive a migration', () => {
  const stored = {
    version: 1,
    printers: [{ id: 'my-own-machine', name: 'The one in the corner', purchasePrice: 999 }],
    materials: [{ id: 'pla-white', name: 'PLA Basic', type: 'PLA', colour: 'White', prices: { ZA: 275 } }],
  };
  const migrated = migrateSettings(stored);

  const mine = migrated.printers.find((p) => p.id === 'my-own-machine');
  assert.ok(mine, 'a printer the user added must not vanish');
  assert.equal(mine.purchasePrice, 999);

  const edited = migrated.materials.find((m) => m.id === 'pla-white');
  assert.equal(edited.prices.ZA, 275, 'the user’s price beats the shipped one');
});

test('an entry the user archived stays archived', () => {
  // Archiving is how this app removes something; nothing deletes. So the
  // top-up below must never bring an archived entry back to life.
  const stored = migrateSettings(null);
  stored.printers.find((p) => p.id === 'ender-3').archived = true;
  const again = migrateSettings(stored);
  assert.equal(again.printers.find((p) => p.id === 'ender-3').archived, true);
});

test('a newly shipped FIELD reaches an entry a workshop already has', () => {
  // The entry-level top-up is not enough on its own. A printer stored before
  // filament capability existed has no `colourMode`, so every machine would
  // read as single-filament — the feature would work for a new user and for
  // nobody else, which is the most confusing way for it to fail.
  const old = migrateSettings(null);
  old.printers = old.printers.map((p) => {
    const stripped = { ...p };
    delete stripped.colourMode;
    return stripped;
  });
  old.printers.find((p) => p.id === 'bambu-x1e').purchasePrice = 12345;

  const migrated = migrateSettings(old);
  assert.equal(migrated.printers.find((p) => p.id === 'bambu-x1e').colourMode, 'multicolour');
  assert.equal(migrated.printers.find((p) => p.id === 'snapmaker-u1').colourMode, 'multimaterial');
  assert.equal(migrated.printers.find((p) => p.id === 'ender-3').colourMode, 'single');
  assert.equal(migrated.printers.find((p) => p.id === 'bambu-x1e').purchasePrice, 12345,
    'and the user’s own value is not overwritten by the shipped one');
});

test('a newly shipped LABOUR OPERATION reaches a workshop that already exists', () => {
  // The third instance of the same fault. The labour list is nested under
  // `labour`, so it sat outside the catalogue top-up and a new operation - the
  // plate changeover - could never arrive.
  const old = migrateSettings(null);
  old.labour.ops = old.labour.ops.filter((op) => op.id !== 'plate-changeover');
  old.labour.ops.find((op) => op.id === 'slicing').minutes = 42;
  assert.ok(!old.labour.ops.some((op) => op.id === 'plate-changeover'));

  const migrated = migrateSettings(old);
  assert.ok(migrated.labour.ops.some((op) => op.id === 'plate-changeover'),
    'a shipped operation the user has never seen should arrive');
  assert.equal(migrated.labour.ops.find((op) => op.id === 'slicing').minutes, 42,
    'and the user’s own minutes are not overwritten');
});

test('a newly shipped catalogue entry reaches a workshop that already exists', () => {
  // Without this an old workshop never sees a colour or a machine added since,
  // because the arrays merge wholesale and theirs wins.
  const old = migrateSettings(null);
  old.materials = old.materials.filter((m) => m.id !== 'pla-green');
  old.shipping = old.shipping.filter((m) => m.id !== 'pudo-l');
  assert.ok(!old.materials.some((m) => m.id === 'pla-green'));

  const migrated = migrateSettings(old);
  assert.ok(migrated.materials.some((m) => m.id === 'pla-green'),
    'a shipped colour the user has never seen should arrive');
  assert.ok(migrated.shipping.some((m) => m.id === 'pudo-l'),
    'a shipped shipping method the user has never seen should arrive');
});

test('an unknown country falls back by name, not by position', () => {
  const migrated = migrateSettings({ version: 1, countryId: 'XX' });
  assert.equal(migrated.countryId, 'ZA');
});

test('changing country changes everything that follows from it', () => {
  const s = applyCountry(defaultSettings(), 'NL');
  assert.equal(s.currencyCode, 'EUR');
  close(s.tax.rate, 0.21, 1e-9, 'BTW');
  assert.equal(s.tax.inclusive, true);
  assert.equal(s.defaultShippingId, 'nl-postnl');
});

test('presets change the commercial model and nothing about the costs', () => {
  const base = settings();
  const internal = applyPreset(base, 'internal');
  const line = calculateLine(bracket(), base);
  const internalLine = calculateLine(bracket(), internal);

  close(internalLine.ctc, line.ctc, 1e-9, 'a preset must not move the CTC');
  // Internal pricing recovers what the job cost and nothing more - which now
  // includes the labour, because a part the company makes for itself still
  // consumed somebody's hour.
  close(internalLine.unitPrice, internalLine.production.trueCost, 1e-6,
    'internal pricing is cost, labour included');
  assert.ok(internalLine.unitPrice < line.unitPrice);
});

test('document numbers advance and never repeat', () => {
  let s = defaultSettings();
  const seen = new Set();
  for (let i = 0; i < 5; i += 1) {
    const { number, numbering } = nextNumber(s, 'quote');
    assert.ok(!seen.has(number), `${number} was issued twice`);
    seen.add(number);
    s = { ...s, numbering };
  }
  assert.match([...seen][0], /^Q\d{4}-0001$/);
});

/* ------------------------------------------------------ pricing details -- */

test('the volume tier is the highest one the quantity reaches', () => {
  assert.equal(volumeTier(undefined, 1).discount, 0);
  assert.equal(volumeTier(undefined, 9).discount, 0.05);
  assert.equal(volumeTier(undefined, 10).discount, 0.10);
  assert.equal(volumeTier(undefined, 10000).discount, 0.25);
});

test('a discount can never take a part below zero', () => {
  const r = applyDiscount(50, { kind: 'fixed', amount: 500 });
  assert.equal(r.unitPrice, 0);
  assert.equal(r.amount, 50);
});

test('demand from capacity reads the bands in order', () => {
  const config = {
    mode: 'capacity',
    capacitySource: 'machineHours',
    availableMachineHoursPerWeek: 100,
    committedMachineHours: 97,
  };
  close(utilisation(config), 0.97, 1e-9, 'utilisation');
  assert.equal(bandFor(undefined, 0.97).multiplier, 1.5);
  const d = demandMultiplier(config);
  assert.equal(d.multiplier, 1.5);
  assert.match(d.reason, /97% committed/);

  // Over capacity is a real state, not an error.
  assert.equal(demandMultiplier({ ...config, committedMachineHours: 150 }).multiplier, 1.75);
});

test('the thirds hold whatever the shares are set to', () => {
  for (const commercialShare of [0, 0.5, 1, 2]) {
    for (const profitShare of [0, 1, 3]) {
      for (const demand of [0.5, 1, 1.75]) {
        for (const labour of [0, 125]) {
          const r = thirdsPrice(100,
            { commercialShare, profitShare, demandTarget: 'commercial+profit' }, demand, labour);
          close(r.recovery + r.labour + r.commercial + r.profit, r.priceBeforeFloor, 1e-9,
            `${commercialShare}/${profitShare}/${demand}/${labour}`);
          close(r.labourAndGrowth, r.labour + r.commercial, 1e-9, 'tank two is its two parts');
          assert.equal(r.recovery, 100, 'cost recovery is never scaled by demand here');
          assert.equal(r.labour, labour, 'nor is labour somebody has already done');
        }
      }
    }
  }
});

test('the three tanks: cost, then the larger of share and work, then half of both', () => {
  // A part with R20 of plastic and R125 of work. Tank one is the R20. Tank two
  // would have been R20, but the work came to R125, so the tank is simply
  // bigger — you keep the larger number. Tank three is half of those two,
  // because they are two thirds and this is the third one.
  const r = thirdsPrice(20, { labourIn: 'labour-third', growthClientShare: 0 }, 1, 125);

  close(r.recovery, 20, 1e-9, 'tank one is the physical cost');
  close(r.labourAndGrowth, 125, 1e-9, 'tank two is the work, which overflowed its share');
  close(r.commercial, 0, 1e-9, 'so there is no room left in it for growth');
  assert.equal(r.labourOverflowed, true);
  close(r.profit, (20 + 125) / 2, 1e-9, 'tank three is half of the first two');
  close(r.price, 20 + 125 + 72.5, 1e-9, 'and the price is the three of them');
  close(r.trueCost, 145, 1e-9, 'the job really cost 145');
  assert.equal(r.belowCost, false);

  const inside = thirdsPrice(145, { labourIn: 'ctc', growthClientShare: 0 }, 1, 125);
  close(inside.price, 435, 1e-9, 'the old reading triples the work as well');
  assert.equal(inside.labour, 0, 'because it is already inside the CTC');
  assert.ok(r.price < inside.price,
    `moving labour out must make the part cheaper: ${r.price} vs ${inside.price}`);
});

test('when the work fits inside its share, this IS the classic rule of thirds', () => {
  // The property that makes this a guideline rather than a new formula: with
  // labour under a third it reduces to exactly CTC × 3, which is what the
  // specification asks for.
  for (const [ctc, labour] of [[100, 0], [100, 40], [100, 100], [22.55, 5]]) {
    const r = thirdsPrice(ctc, { labourIn: 'labour-third', growthClientShare: 0 }, 1, labour);
    close(r.price, ctc * 3, 1e-9, `CTC ${ctc} with ${labour} of work`);
    close(r.labourAndGrowth, ctc, 1e-9, 'the second tank is exactly one share');
    close(r.commercial, ctc - labour, 1e-9, 'and growth is whatever the work left in it');
    assert.equal(r.labourOverflowed, false);
  }
});

test('the tanks may be uneven, and the app says which one overflowed', () => {
  const under = thirdsPrice(100, { growthClientShare: 0 }, 1, 30);
  const over = thirdsPrice(100, { growthClientShare: 0 }, 1, 300);

  assert.equal(under.labourOverflowed, false);
  close(under.commercial, 70, 1e-9, 'seventy of growth fills the rest of that tank');

  assert.equal(over.labourOverflowed, true);
  close(over.labourAndGrowth, 300, 1e-9, 'the tank is as big as the work needed');
  close(over.profit, 200, 1e-9, 'and profit follows the two tanks below it');
  close(over.price, 100 + 300 + 200, 1e-9);
});

test('growth is split with the customer, and the profit third follows it', () => {
  // A part with R100 of plastic and no work: the second tank is all growth.
  const full = thirdsPrice(100, { growthClientShare: 0 }, 1, 0);
  const half = thirdsPrice(100, { growthClientShare: 0.5 }, 1, 0);
  const all = thirdsPrice(100, { growthClientShare: 1 }, 1, 0);

  close(full.price, 300, 1e-9, 'keeping all the growth is the classic CTC x 3');
  close(half.commercial, 50, 1e-9, 'half the growth is kept in the price');
  close(half.growthSaved, 50, 1e-9, 'and half is handed back to the customer');
  // Profit is half of tank one plus the growth we KEPT, so it shrinks with the
  // saving rather than being measured on growth we gave away.
  close(half.profit, 75, 1e-9, 'the profit third follows the reduced second tank');
  close(half.price, 225, 1e-9, '100 recovery + 50 kept growth + 75 profit');
  close(all.price, 150, 1e-9, 'give it all away and only recovery plus half of it as profit is left');
  // The saving the customer sees is the full drop, growth plus the profit on it.
  close(full.price - half.price, 75, 1e-9, 'the customer saves the half-growth and the profit it carried');
  // The returned parts still add up to the price that is charged.
  close(half.recovery + half.labour + half.commercial + half.profit, half.priceBeforeFloor, 1e-9,
    'the charged tanks still sum to the price');
});

test('the growth split does nothing when the work overflows its tank', () => {
  // R20 of plastic and R125 of work: the tank is full of labour, no growth to
  // give away, so the share cannot move the price.
  const kept = thirdsPrice(20, { labourIn: 'labour-third', growthClientShare: 0 }, 1, 125);
  const given = thirdsPrice(20, { labourIn: 'labour-third', growthClientShare: 0.5 }, 1, 125);
  close(kept.price, given.price, 1e-9, 'there is nothing to hand back');
  close(given.growthSaved, 0, 1e-9, 'and so no saving');
});

test('a growth uplift on recovered labour is charged once, and is optional', () => {
  const plain = thirdsPrice(20, { labourIn: 'labour-third', labourUplift: 0 }, 1, 100);
  const withGrowth = thirdsPrice(20, { labourIn: 'labour-third', labourUplift: 0.25 }, 1, 100);
  close(plain.labour, 100, 1e-9, 'zero uplift recovers labour at cost');
  close(withGrowth.labour, 125, 1e-9, 'a quarter on top is a quarter, not a third');
  // The uplift lands in tank two, and tank three is half of tanks one and two,
  // so a quarter more work raises the price by that quarter and half of it again.
  close(withGrowth.price - plain.price, 25 * 1.5, 1e-9);
});

test('selling below what the job actually cost is still detected', () => {
  // With labour outside the CTC, "below cost" has to mean below CTC PLUS
  // labour, or the warning would never fire on the jobs where it matters most.
  const r = thirdsPrice(20, { labourIn: 'labour-third', commercialShare: 0, profitShare: 0 }, 1, 125);
  close(r.price, 145, 1e-9, 'recovery plus labour and nothing else');
  assert.equal(r.belowCost, false, 'exactly covering cost is not below it');

  const cut = thirdsPrice(20, {
    labourIn: 'labour-third', commercialShare: 0, profitShare: 0, demandTarget: 'whole',
  }, 0.5, 125);
  assert.equal(cut.belowCost, true, 'halving the whole price does not cover the work');
});

test('the whole-price demand target can sell below cost, and says so', () => {
  const r = thirdsPrice(100, { commercialShare: 1, profitShare: 1, demandTarget: 'whole' }, 0.3);
  assert.ok(r.belowCost, 'a 0.3x multiplier on the whole price is below cost');
  const safe = thirdsPrice(100, { commercialShare: 1, profitShare: 1, demandTarget: 'commercial+profit' }, 0.3);
  assert.equal(safe.belowCost, false);
});

/* ------------------------------------------------------ a parameter sweep -- */

test('a sweep over every combination that matters produces no NaN and no negative', () => {
  const s = settings();
  const geometries = [
    analyse(box(5, 5, 5)),
    analyse(box(50, 50, 20)),
    analyse(box(200, 200, 200)),
    analyse(box(1, 1, 200)),
  ];
  let cases = 0;

  for (const geometry of geometries) {
    for (const profile of s.profiles) {
      for (const printer of s.printers) {
        for (const quantity of [1, 7, 100]) {
          for (const colours of [1, 4, 6]) {
            const line = calculateLine({
              quantity,
              colours,
              profileId: profile.id,
              printerId: printer.id,
              materialId: 'pla-dark-grey',
              geometry,
              hardware: [{ hardwareId: 'magnet-6x3', qty: 2 }],
            }, s);
            cases += 1;

            const walk = (value, path) => {
              if (typeof value === 'number') {
                assert.ok(Number.isFinite(value), `${path} is ${value} (${profile.id}/${printer.id})`);
              } else if (Array.isArray(value)) {
                value.forEach((v, i) => walk(v, `${path}[${i}]`));
              } else if (value && typeof value === 'object') {
                for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
              }
            };
            walk(line.production, 'production');
            walk(line.price, 'price');
            assert.ok(line.ctc >= 0, `CTC ${line.ctc}`);
            assert.ok(line.unitPrice >= 0, `unit price ${line.unitPrice}`);
            assert.ok(line.estimate.grams >= 0);
            // A part can never be quoted as containing more plastic than solid.
            const solid = geometry.volume;
            if (solid > 0) {
              assert.ok(line.estimate.levels[line.estimate.method].bodyVolume <= solid * 1.021,
                `${profile.id} on ${printer.id} quoted more than solid`);
            }
          }
        }
      }
    }
  }
  assert.ok(cases >= 600, `only ${cases} combinations were swept`);
});

test('assertSeparation has teeth: it fails on a deliberately broken result', () => {
  // A test written after the fact against corrected code passes whether or not
  // it tests anything. Break it on purpose and confirm it notices.
  const s = settings();
  const r = calculateOrder({ lines: [{ ...bracket() }], shippingMethodId: 'pudo-s' }, s);
  assert.equal(assertSeparation(r).ok, true);

  const broken = clone(r);
  broken.parts.total += 90;                      // shipping smuggled into the parts
  assert.equal(assertSeparation(broken).partsMatch, false);
  assert.equal(assertSeparation(broken).ok, false);
});

test('support removal is charged only on parts marked as needing it', () => {
  const s = settings();
  const withSupport = calculateOrder({
    lines: [{ ...bracket(), quantity: 3, needsSupport: true }],
  }, s);
  const without = calculateOrder({
    lines: [{ ...bracket(), quantity: 3, needsSupport: false }],
  }, s);

  const supLine = (r) => r.lines[0].detail.labour.lines.find((l) => l.id === 'support-removal');
  assert.ok(supLine(withSupport), 'the support-removal step appears when the part needs it');
  assert.equal(supLine(withSupport).count, 3, 'once per part, three parts');
  assert.equal(supLine(without), undefined, 'and never when it does not');
  // And it makes the flagged part cost more labour.
  assert.ok(withSupport.totals.trueCost > without.totals.trueCost);
});
