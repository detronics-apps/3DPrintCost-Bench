/**
 * The shipped catalogues: countries, materials, printers, shipping, packaging,
 * hardware and labour.
 *
 * These read like data files, and data files are exactly where a wrong id or a
 * missing price hides. Most of what follows is structural: every id referenced
 * anywhere must exist, every enum value must be one the other side honours, and
 * nothing may resolve by position.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COUNTRIES, findCountry, electricityTariff, TAX_NOTES, AS_OF } from '../js/countries.js';
import { CURRENCIES } from '../js/money.js';
import {
  DEFAULT_MATERIALS, MATERIAL_TYPES, materialType, spoolPrice, pricePerKg,
  pricePerGram, density, gramsFor, findMaterial, materialsOfType, colourNames,
} from '../js/materials.js';
import {
  DEFAULT_PRINTERS, machineHourCost, lifetimeHours, fitsBuildVolume,
  supportsMaterial, findPrinter,
} from '../js/printers.js';
import {
  DEFAULT_SHIPPING, methodsForCountry, findShipping, packageFits,
  autoSelectShipping, freeShipping, shippingCost, PACKAGE_SIZES,
} from '../js/shipping.js';
import {
  DEFAULT_PACKAGING, DEFAULT_HARDWARE, itemPrice, choosePackaging, containerFits,
  hardwareCost, findHardware, findPackaging,
} from '../js/packaging.js';
import {
  DEFAULT_LABOUR_OPS, LABOUR_SCOPES, SCOPE_IDS, labourCost, groupLabour,
} from '../js/labour.js';
import { energyKWh, electricityCost } from '../js/electricity.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);
const countryIds = DEFAULT_COUNTRIES.map((c) => c.id);

/* ------------------------------------------------------------ countries -- */

test('every country names a currency the app actually has', () => {
  for (const country of DEFAULT_COUNTRIES) {
    assert.ok(CURRENCIES[country.currency], `${country.id} wants ${country.currency}`);
    assert.ok(country.electricity.tariff > 0, `${country.id} tariff`);
    assert.ok(country.labourRate > 0, `${country.id} labour rate`);
    assert.equal(country.asOf, AS_OF, `${country.id} must be dated`);
    assert.ok(TAX_NOTES[country.id], `${country.id} has no tax note`);
  }
});

test('a country falls back by name and its tariff alternatives resolve', () => {
  assert.equal(findCountry(DEFAULT_COUNTRIES, 'NL').id, 'NL');
  assert.equal(findCountry(DEFAULT_COUNTRIES, 'nope').id, 'ZA');

  const za = findCountry(DEFAULT_COUNTRIES, 'ZA');
  close(electricityTariff(za), 3.1, 1e-9, 'the default tariff');
  close(electricityTariff(za, 'prepaid-b1'), 2.65, 1e-9, 'a named alternative');
  close(electricityTariff(za, 'not-a-tariff'), 3.1, 1e-9, 'an unknown one falls back');
});

/* ------------------------------------------------------------ materials -- */

test('every material has a type the app knows and a price in every country', () => {
  const types = new Set(MATERIAL_TYPES.map((t) => t.id));
  for (const m of DEFAULT_MATERIALS) {
    assert.ok(types.has(m.type), `${m.id} is type "${m.type}", which is not in the table`);
    for (const id of countryIds) {
      assert.ok(spoolPrice(m, id) > 0, `${m.id} has no price for ${id}`);
    }
  }
});

test('a missing country price is null, never another country’s number', () => {
  const orphan = { ...DEFAULT_MATERIALS[0], prices: { ZA: 350 } };
  assert.equal(spoolPrice(orphan, 'NL'), null);
  assert.equal(pricePerKg(orphan, 'NL'), null);
  assert.equal(pricePerGram(orphan, 'NL'), null);
  assert.equal(spoolPrice(orphan, 'ZA'), 350);
});

test('an override beats the catalogue price', () => {
  const overridden = { ...DEFAULT_MATERIALS[0], priceOverride: 275 };
  assert.equal(spoolPrice(overridden, 'ZA'), 275);
  close(pricePerGram(overridden, 'ZA'), 0.275, 1e-9, 'per gram');
});

test('grams follow from volume and density', () => {
  const pla = findMaterial(DEFAULT_MATERIALS, 'pla-dark-grey');
  close(density(pla), 1.24, 1e-9, 'PLA density');
  // 1000 mm3 is 1 cm3, so a cubic centimetre of PLA weighs 1.24 g.
  close(gramsFor(1000, pla), 1.24, 1e-9, 'one cm3');
  close(gramsFor(24000, pla), 29.76, 1e-9, 'a 20x30x40 solid');
});

test('material lookups fall back by name, and filters work', () => {
  assert.equal(findMaterial(DEFAULT_MATERIALS, 'nope').id, 'pla-dark-grey');
  assert.equal(materialType('nope').id, 'PLA');
  assert.ok(materialsOfType(DEFAULT_MATERIALS, 'PLA').every((m) => m.type === 'PLA'));
  assert.ok(colourNames(DEFAULT_MATERIALS).includes('Dark Grey'));
});

/* ------------------------------------------------------------- printers -- */

test('every printer names materials the catalogue can supply', () => {
  const types = new Set(MATERIAL_TYPES.map((t) => t.id));
  for (const p of DEFAULT_PRINTERS) {
    for (const type of p.materials) {
      assert.ok(types.has(type), `${p.id} claims to run "${type}"`);
    }
    assert.ok(p.build.x > 0 && p.build.y > 0 && p.build.z > 0, `${p.id} build volume`);
    assert.ok(p.flowRate > 0 && p.powerW > 0, `${p.id} flow and power`);
    assert.ok(p.colourSlots >= 1 && p.maxColours >= p.colourSlots, `${p.id} colours`);
    assert.equal(p.verified, false, 'shipped specs are starting values, and must say so');
  }
});

test('lifetime hours come from the service life unless overridden', () => {
  const p = { serviceLifeYears: 5, hoursPerYear: 800, lifetimeHoursOverride: null };
  assert.equal(lifetimeHours(p), 4000);
  assert.equal(lifetimeHours({ ...p, lifetimeHoursOverride: 6000 }), 6000);
  assert.ok(lifetimeHours({}) >= 1, 'never divides by zero');
});

test('a part is checked against the build volume in every orientation', () => {
  const printer = findPrinter(DEFAULT_PRINTERS, 'ender-3');   // 220 x 220 x 250
  assert.equal(fitsBuildVolume(printer, { x: 240, y: 100, z: 100 }).fits, true,
    'it fits stood on end');
  assert.equal(fitsBuildVolume(printer, { x: 260, y: 100, z: 100 }).fits, false);
  assert.ok(fitsBuildVolume(printer, { x: 260, y: 100, z: 100 }).worstOver > 0);
  assert.equal(fitsBuildVolume(printer, { x: 219, y: 219, z: 249 }, { clearance: 5 }).fits, false,
    'clearance is honoured');
});

test('material support is a real gate, and an empty list means no restriction', () => {
  const ender = findPrinter(DEFAULT_PRINTERS, 'ender-3');
  assert.equal(supportsMaterial(ender, 'PLA'), true);
  assert.equal(supportsMaterial(ender, 'PC'), false);
  assert.equal(supportsMaterial({ materials: [] }, 'PC'), true);
});

/* ------------------------------------------------------------- shipping -- */

test('every shipping method is priced, sized and attributed to a country', () => {
  const sizes = new Set(PACKAGE_SIZES.map((s) => s.id));
  for (const m of DEFAULT_SHIPPING) {
    assert.ok(sizes.has(m.size), `${m.id} has size "${m.size}"`);
    assert.ok(m.basePrice >= 0, `${m.id} price`);
    assert.ok(m.maxDims.length === 3 && m.maxWeightG > 0, `${m.id} limits`);
    assert.ok(m.country === '*' || countryIds.includes(m.country), `${m.id} country`);
  }
});

test('the South African default is a R90 PUDO locker', () => {
  const pudo = findShipping(DEFAULT_SHIPPING, 'pudo-s');
  assert.equal(pudo.basePrice, 90);
  assert.equal(pudo.carrier, 'PUDO');
  assert.equal(shippingCost(pudo).total, 90);
});

test('a parcel is fitted in any orientation, and refused when it does not go', () => {
  const pudo = findShipping(DEFAULT_SHIPPING, 'pudo-s');    // 600 x 410 x 80
  assert.equal(packageFits(pudo, { x: 70, y: 400, z: 500 }, 1000).fits, true);
  assert.equal(packageFits(pudo, { x: 200, y: 200, z: 200 }, 1000).fits, false);
  assert.equal(packageFits(pudo, { x: 10, y: 10, z: 10 }, 9000).weightOk, false);
});

test('auto-selection takes the cheapest method the parcel actually fits', () => {
  const small = autoSelectShipping(DEFAULT_SHIPPING, 'ZA', { x: 100, y: 100, z: 50 }, 400);
  assert.equal(small.id, 'pudo-s');
  // 300 mm lies happily along a locker's 600 mm length, so the Medium takes it.
  const tall = autoSelectShipping(DEFAULT_SHIPPING, 'ZA', { x: 100, y: 100, z: 300 }, 400);
  assert.equal(tall.id, 'pudo-m');
  // A 300 mm cube does not: two of its sides exceed the Medium's 190 mm depth.
  const cube = autoSelectShipping(DEFAULT_SHIPPING, 'ZA', { x: 300, y: 300, z: 300 }, 400);
  assert.equal(cube.id, 'pudo-l');
  const enormous = autoSelectShipping(DEFAULT_SHIPPING, 'ZA', { x: 2000, y: 2000, z: 2000 }, 400);
  assert.equal(enormous, null, 'nothing fits, and that is the answer');
});

test('free shipping measures the part value and can be set per part', () => {
  const rule = { enabled: true, threshold: 900, appliesTo: 'after', basis: 'order' };
  assert.equal(freeShipping(rule, { partValueAfterDiscount: 900 }).free, true);
  assert.equal(freeShipping(rule, { partValueAfterDiscount: 899.99 }).free, false);

  const perPart = { ...rule, basis: 'part' };
  assert.equal(freeShipping(perPart, { partValueAfterDiscount: 1200, lineValues: [600, 600] }).free, false,
    'two lines of 600 do not make a 900 line');
  assert.equal(freeShipping(perPart, { partValueAfterDiscount: 1200, lineValues: [950, 250] }).free, true);

  const before = { ...rule, appliesTo: 'before' };
  assert.equal(freeShipping(before, { partValueBeforeDiscount: 950, partValueAfterDiscount: 800 }).free, true);
  assert.equal(freeShipping({ ...rule, enabled: false }, { partValueAfterDiscount: 5000 }).free, false);
});

/* ----------------------------------------------------------- packaging -- */

test('every packaging and hardware item is priced in every country', () => {
  for (const item of [...DEFAULT_PACKAGING, ...DEFAULT_HARDWARE]) {
    for (const id of countryIds) {
      assert.ok(itemPrice(item, id) > 0, `${item.id} has no price for ${id}`);
    }
  }
  for (const p of DEFAULT_PACKAGING) {
    assert.ok(['container', 'consumable'].includes(p.kind), `${p.id} kind "${p.kind}"`);
    if (p.kind === 'container') assert.equal(p.inner?.length, 3, `${p.id} inner size`);
  }
});

test('packaging picks the cheapest box the parts actually go in', () => {
  const chosen = choosePackaging(DEFAULT_PACKAGING, {
    dims: { x: 50, y: 50, z: 20 }, count: 1, countryId: 'ZA',
  });
  assert.equal(chosen.container.id, 'bag-small');
  assert.ok(chosen.cost > 0);
  assert.ok(chosen.lines.length > 1, 'consumables come with it');

  const many = choosePackaging(DEFAULT_PACKAGING, {
    dims: { x: 150, y: 140, z: 90 }, count: 40, countryId: 'ZA',
  });
  assert.notEqual(many.container?.id, 'bag-small', 'forty of them need a bigger box');
});

test('a part nothing holds is reported rather than squeezed in', () => {
  const chosen = choosePackaging(DEFAULT_PACKAGING, {
    dims: { x: 900, y: 900, z: 900 }, count: 1, countryId: 'ZA',
  });
  assert.equal(chosen.container, null);
  assert.equal(chosen.fits, false);
  assert.equal(containerFits(findPackaging(DEFAULT_PACKAGING, 'box-large'), { x: 900, y: 1, z: 1 }), false);
});

test('a forced container overrides the automatic choice', () => {
  const forced = choosePackaging(DEFAULT_PACKAGING, {
    dims: { x: 50, y: 50, z: 20 }, count: 1, countryId: 'ZA', forcedContainerId: 'box-large',
  });
  assert.equal(forced.container.id, 'box-large');
});

test('hardware cost separates money, minutes and risk', () => {
  const result = hardwareCost(DEFAULT_HARDWARE, [
    { hardwareId: 'magnet-6x3', qty: 4 },
    { hardwareId: 'nfc-ntag215', qty: 1 },
  ], 'ZA');

  close(result.cost, 4 * 3.2 + 12, 1e-9, 'cost');
  assert.equal(result.inserts, 5);
  assert.ok(result.insertMinutes > 0 && result.pauseMinutes > 0);
  // Four 2% magnets and one 3% tag: survival is 0.98^4 x 0.97.
  close(result.survivalRate, 0.98 ** 4 * 0.97, 1e-12, 'compounded survival');
  close(result.failureRate, 1 - result.survivalRate, 1e-12, 'failure is its complement');
});

test('during-print hardware is embedded and costs a mid-print insertion', () => {
  const r = hardwareCost(DEFAULT_HARDWARE, [{ hardwareId: 'magnet-6x3', qty: 2 }], 'ZA');
  assert.equal(r.inserts, 2, 'a magnet is placed mid-print');
  assert.ok(r.cost > 0, 'and it is an embedded cost, at risk with the print');
  assert.equal(r.afterCost, 0);
  assert.equal(r.fitMinutes, 0);
});

test('after-print hardware ships loose by default: supplied, not fitted', () => {
  const r = hardwareCost(DEFAULT_HARDWARE, [{ hardwareId: 'insert-m3', qty: 4 }], 'ZA');
  assert.equal(r.inserts, 0, 'nothing happens mid-print');
  assert.equal(r.cost, 0, 'it is not an embedded, at-risk cost');
  assert.ok(r.afterCost > 0, 'the component is still supplied and charged');
  assert.equal(r.fitMinutes, 0, 'no fitting labour when it is only supplied');
  assert.equal(r.looseCount, 4);
  assert.ok(r.looseWeightG > 0, 'and it adds weight to the box');
});

test('an after-print component marked to fit adds assembly labour, not loose weight', () => {
  const r = hardwareCost(DEFAULT_HARDWARE, [{ hardwareId: 'insert-m3', qty: 4, fit: true }], 'ZA');
  assert.ok(r.afterCost > 0, 'the component is still charged');
  assert.equal(r.looseCount, 0, 'it is not loose — it is fitted');
  assert.equal(r.looseWeightG, 0);
  assert.ok(r.fitMinutes > 0, 'fitting it is post-processing labour');
  assert.equal(r.fitInserts, 4);
});

test('an unknown hardware id contributes nothing rather than guessing', () => {
  const result = hardwareCost(DEFAULT_HARDWARE, [{ hardwareId: 'nope', qty: 5 }], 'ZA');
  assert.equal(result.cost, 0);
  assert.equal(result.inserts, 0);
  assert.equal(result.failureRate, 0);
  assert.equal(findHardware(DEFAULT_HARDWARE, 'nope'), null);
});

/* -------------------------------------------------------------- labour -- */

test('every labour operation scales with something the calculator understands', () => {
  for (const op of DEFAULT_LABOUR_OPS) {
    assert.ok(SCOPE_IDS.includes(op.per), `${op.id} scales per "${op.per}", which is not a scope`);
    assert.ok(op.minutes > 0, `${op.id} minutes`);
    assert.ok(op.group && op.hint, `${op.id} needs a group and a hint`);
  }
  for (const scope of LABOUR_SCOPES) assert.ok(scope.name && scope.hint);
});

test('the default list covers the whole workflow, not just the printing', () => {
  const groups = new Set(DEFAULT_LABOUR_OPS.map((o) => o.group));
  for (const wanted of ['Front office', 'Preparation', 'Machine', 'Finishing', 'Fulfilment']) {
    assert.ok(groups.has(wanted), `nothing covers ${wanted}`);
  }
});

test('order and job labour is spread across the units, per-part labour is not', () => {
  const ops = [
    { id: 'admin', name: 'Admin', minutes: 60, per: 'order', complexity: 1, enabled: true },
    { id: 'setup', name: 'Setup', minutes: 30, per: 'job', complexity: 1, enabled: true },
    { id: 'finish', name: 'Finish', minutes: 6, per: 'unit', complexity: 1, enabled: true },
  ];
  const one = labourCost(ops, { quantity: 1, jobs: 1 }, { rate: 120 });
  close(one.minutes, 96, 1e-9, 'one part');
  close(one.cost, (96 / 60) * 120, 1e-9, 'one part cost');

  const ten = labourCost(ops, { quantity: 10, jobs: 1 }, { rate: 120 });
  close(ten.minutes, 60 + 30 + 60, 1e-9, 'ten parts, one plate');
  close(ten.minutesPerUnit, 15, 1e-9, 'per unit');
  assert.ok(ten.minutesPerUnit < one.minutesPerUnit,
    'ten parts must cost less labour each without any discount');
});

test('colour changes and inserts only cost labour when there are any', () => {
  const ops = [
    { id: 'cc', name: 'Colour change', minutes: 4, per: 'colourChange', complexity: 1, enabled: true },
    { id: 'ins', name: 'Insert', minutes: 2, per: 'hardwareInsert', complexity: 1, enabled: true },
  ];
  assert.equal(labourCost(ops, { quantity: 1, jobs: 1 }, { rate: 120 }).minutes, 0);
  close(
    labourCost(ops, { quantity: 1, jobs: 1, colourChanges: 3, hardwareInserts: 2 }, { rate: 120 }).minutes,
    3 * 4 + 2 * 2, 1e-9, 'with changes and inserts',
  );
});

test('a disabled operation costs nothing, and complexity scales what is left', () => {
  const ops = [
    { id: 'a', name: 'A', minutes: 10, per: 'unit', complexity: 1, enabled: false },
    { id: 'b', name: 'B', minutes: 10, per: 'unit', complexity: 2, enabled: true },
  ];
  const result = labourCost(ops, { quantity: 1, jobs: 1 }, { rate: 60, globalComplexity: 1.5 });
  close(result.minutes, 10 * 2 * 1.5, 1e-9, 'complexity compounds');
  assert.equal(result.lines.length, 1);
  assert.equal(groupLabour(result.lines).length, 1);
});

test('an unknown scope is treated as per-order rather than dropped in silence', () => {
  const ops = [{ id: 'x', name: 'X', minutes: 10, per: 'per-fortnight', complexity: 1, enabled: true }];
  const result = labourCost(ops, { quantity: 4, jobs: 2 }, { rate: 60 });
  close(result.minutes, 10, 1e-9, 'charged once, not zero times');
  assert.equal(result.lines[0].per, 'order');
});

/* --------------------------------------------------------- electricity -- */

test('energy separates heat-up, printing and idle', () => {
  const printer = { powerW: 200, heatupPowerW: 600, heatupMinutes: 6, idlePowerW: 10 };
  const e = energyKWh(printer, 120, { idleMinutes: 30, partsOnPlate: 1 });
  close(e.heatup, 0.6 * 0.1, 1e-9, 'heat-up');
  close(e.printing, 0.2 * 2, 1e-9, 'printing');
  close(e.idle, 0.01 * 0.5, 1e-9, 'idle');
  close(e.total, e.heatup + e.printing + e.idle, 1e-12, 'total');
});

test('a full plate shares one heat-up between all of it', () => {
  const printer = { powerW: 200, heatupPowerW: 600, heatupMinutes: 6, idlePowerW: 0 };
  const alone = energyKWh(printer, 60, { partsOnPlate: 1 });
  const shared = energyKWh(printer, 60, { partsOnPlate: 10 });
  close(shared.heatup, alone.heatup / 10, 1e-12, 'heat-up per part');
  close(shared.printing, alone.printing, 1e-12, 'printing does not change');
});

test('electricity cost is energy times the configured tariff', () => {
  const printer = { powerW: 350, heatupPowerW: 900, heatupMinutes: 8, idlePowerW: 18 };
  const cost = electricityCost(printer, 180, 3.1, { partsOnPlate: 1 });
  close(cost.cost, cost.total * 3.1, 1e-12, 'cost');
  close(cost.printingCost, (0.35 * 3) * 3.1, 1e-9, 'the printing share');
  assert.equal(electricityCost(printer, 180, 0).cost, 0, 'a zero tariff costs nothing');
});
