/**
 * The customer-facing form's configuration.
 *
 * Two things matter here and both are security-shaped rather than arithmetic:
 * what travels in a link handed to a customer, and whether the form prices the
 * same as internal quoting. A second pricing path that drifts is how a customer
 * ends up quoted one number and invoiced another.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portalConfig, pricingSettings, settingsFromConfig, portalFragment, WITHHELD_KEYS,
} from '../js/portal-config.js';
import { defaultSettings, clone } from '../js/settings.js';
import { calculateOrder } from '../js/engine.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

const withPortal = () => {
  const s = defaultSettings();
  s.customerPortal.enabled = true;
  s.company.name = 'Test Workshop';
  s.company.registration = 'REG-12345';
  s.company.vatNumber = 'VAT-98765';
  s.company.terms = 'Secret internal terms';
  return s;
};

const line = () => ({
  quantity: 3,
  profileId: 'function',
  printerId: 'bambu-x1e',
  materialId: 'petg-dark-grey',
  geometry: analyse(box(50, 50, 20)),
  colours: 1,
  hardware: [],
});

test('the form prices exactly the same as internal quoting', () => {
  // One engine. If these ever disagree, a customer has been quoted a number the
  // company cannot reproduce.
  const settings = withPortal();
  const order = { lines: [line()], shippingMethodId: 'pudo-s' };

  const internal = calculateOrder(order, settings);
  const external = calculateOrder(order, settingsFromConfig(portalConfig(settings)));

  close(external.totals.finalInvoice, internal.totals.finalInvoice, 1e-9, 'invoice total');
  close(external.parts.total, internal.parts.total, 1e-9, 'part price');
  close(external.totals.costToCompany, internal.totals.costToCompany, 1e-9, 'CTC');
  assert.equal(external.capacity.leadDays, internal.capacity.leadDays);
});

test('the form offers hardware, and it prices the same as internal', () => {
  const settings = withPortal();
  const config = portalConfig(settings);
  assert.ok(Array.isArray(config.hardware) && config.hardware.length > 0,
    'the customer is offered a hardware pick-list');
  assert.ok(config.hardware.some((h) => h.id === 'nfc-ntag215'), 'the NFC tag is on the list');
  // The internal part number must not travel in a customer link.
  assert.ok(!('partNumber' in config.hardware[0]), 'the internal part number is withheld');

  const withHw = { ...line(), hardware: [{ hardwareId: 'magnet-6x3', qty: 2 }] };
  const order = { lines: [withHw], shippingMethodId: 'pudo-s' };
  const internal = calculateOrder(order, settings);
  const external = calculateOrder(order, settingsFromConfig(config));
  close(external.totals.finalInvoice, internal.totals.finalInvoice, 1e-9, 'invoice total with hardware');
  assert.ok(internal.lines[0].production.hardware > 0, 'the magnets add cost');
});

test('the config withholds what pricing does not need', () => {
  const settings = withPortal();
  settings.numbering.nextInvoice = 42;
  const config = portalConfig(settings);

  for (const key of WITHHELD_KEYS) {
    assert.equal(config.pricing[key], undefined,
      `"${key}" travels in a customer link and has no business doing so`);
  }
  const text = JSON.stringify(config);
  assert.ok(!text.includes('REG-12345'), 'the registration number travelled');
  assert.ok(!text.includes('VAT-98765'), 'the VAT number travelled');
  assert.ok(!text.includes('Secret internal terms'), 'the internal terms travelled');
});

test('the customer-facing half of the config carries no cost model', () => {
  // `pricing` necessarily holds the cost model — the form has to price, and
  // there is no server. Everything the page renders comes from the rest, and
  // the rest must be clean.
  const config = portalConfig(withPortal());
  const shown = { ...config };
  delete shown.pricing;
  const text = JSON.stringify(shown).toLowerCase();

  for (const word of ['purchaseprice', 'maintenance', 'labour', 'thirds', 'allocation',
    'scrap', 'demand', 'margin', 'profit', 'costtocompany']) {
    assert.ok(!text.includes(word), `the visible config mentions "${word}"`);
  }
});

test('only the allowed options are offered', () => {
  const settings = withPortal();
  settings.customerPortal.allowedProfiles = ['function', 'visual'];
  settings.customerPortal.allowedPrinters = ['bambu-x1e'];
  settings.customerPortal.allowedMaterials = ['pla-dark-grey'];

  const config = portalConfig(settings);
  assert.deepEqual(config.profiles.map((p) => p.id), ['function', 'visual']);
  assert.deepEqual(config.printers.map((p) => p.id), ['bambu-x1e']);
  assert.deepEqual(config.materials.map((m) => m.id), ['pla-dark-grey']);
});

test('an empty allow-list means everything, not nothing', () => {
  const settings = withPortal();
  settings.customerPortal.allowedPrinters = [];
  const config = portalConfig(settings);
  assert.equal(config.printers.length, settings.printers.filter((p) => !p.archived).length);
});

test('an archived printer is never offered, allow-list or not', () => {
  const settings = withPortal();
  settings.printers.find((p) => p.id === 'ender-3').archived = true;
  assert.ok(!portalConfig(settings).printers.some((p) => p.id === 'ender-3'));
});

test('express is withheld when the company has turned it off', () => {
  const settings = withPortal();
  settings.customerPortal.allowExpress = false;
  const config = portalConfig(settings);
  assert.ok(!config.shipping.some((m) => /express/i.test(m.id)),
    'an express option was offered after being turned off');

  settings.customerPortal.allowExpress = true;
  assert.ok(portalConfig(settings).shipping.some((m) => /express/i.test(m.id)));
});

test('only the country’s own shipping methods are offered', () => {
  const settings = withPortal();
  const config = portalConfig(settings);
  for (const method of config.shipping) {
    const full = settings.shipping.find((m) => m.id === method.id);
    assert.ok(full.country === '*' || full.country === settings.countryId,
      `${method.id} belongs to ${full.country}, not ${settings.countryId}`);
  }
});

test('a link survives the round trip through a URL fragment', () => {
  const settings = withPortal();
  const fragment = portalFragment(settings);
  const decoded = JSON.parse(decodeURIComponent(fragment));
  const rebuilt = settingsFromConfig(decoded);

  const order = { lines: [line()], shippingMethodId: 'auto' };
  close(
    calculateOrder(order, rebuilt).totals.finalInvoice,
    calculateOrder(order, settings).totals.finalInvoice,
    1e-9,
    'the price survives the link',
  );
  assert.ok(!fragment.includes('#'), 'a fragment cannot contain an unescaped #');
});

test('a tampered link cannot make the engine produce nonsense', () => {
  // A customer can edit the fragment. They can give themselves a lower price -
  // that is unavoidable without a server, and the company confirms every quote.
  // What must not happen is a NaN, a negative price, or a crash.
  const settings = withPortal();
  const config = portalConfig(settings);

  const attacks = [
    (c) => { c.pricing.thirds.commercialShare = -999; },
    (c) => { c.pricing.ctc.generalAllowance = Number.NaN; },
    (c) => { c.pricing.scrap.rate = 5; },
    (c) => { c.pricing.materials = []; },
    (c) => { c.pricing.printers = []; },
    (c) => { c.pricing.labour = { rate: -50, ops: [] }; },
    (c) => { c.pricing.demand = { mode: 'capacity', availableMachineHoursPerWeek: 0 }; },
    (c) => { delete c.pricing.thirds; },
  ];

  for (const [i, attack] of attacks.entries()) {
    const tampered = clone(config);
    attack(tampered);
    const rebuilt = settingsFromConfig(tampered);
    const result = calculateOrder({ lines: [line()], shippingMethodId: 'auto' }, rebuilt);

    assert.ok(Number.isFinite(result.totals.finalInvoice), `attack ${i}: invoice is not finite`);
    assert.ok(result.totals.finalInvoice >= 0, `attack ${i}: negative invoice`);
    assert.ok(Number.isFinite(result.totals.costToCompany), `attack ${i}: CTC is not finite`);
    assert.ok(result.totals.costToCompany >= 0, `attack ${i}: negative CTC`);
  }
});

test('an absent config leaves nothing to price with, rather than guessing', () => {
  const rebuilt = settingsFromConfig(null);
  assert.equal(rebuilt.version, 1, 'it falls back to the shipped defaults');
  assert.ok(rebuilt.printers.length > 0);
});

test('pricingSettings keeps every slice the engine actually reads', () => {
  const settings = withPortal();
  const trimmed = pricingSettings(settings);
  for (const key of ['printers', 'materials', 'profiles', 'labour', 'thirds', 'ctc',
    'scrap', 'shipping', 'packaging', 'hardware', 'freeShipping', 'factorModel',
    'estimate', 'countries', 'tax', 'demand', 'allocations']) {
    assert.ok(trimmed[key] !== undefined, `pricing needs ${key} and it was dropped`);
  }
});
