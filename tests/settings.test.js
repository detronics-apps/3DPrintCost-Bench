/**
 * Company-wide settings: the default printer (new) and the country/currency
 * default, both of which the estimator and the client form lean on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, migrateSettings, ctcAllowanceRate } from '../js/settings.js';

test('a fresh install has a default printer that is a real machine', () => {
  const s = defaultSettings();
  assert.ok(s.defaultPrinterId, 'there is a default printer');
  assert.ok(s.printers.some((p) => p.id === s.defaultPrinterId), 'and it exists in the list');
});

test('the default currency is South African rand', () => {
  const s = defaultSettings();
  assert.equal(s.countryId, 'ZA');
  assert.equal(s.currencyCode, 'ZAR');
});

test('the general allowance is the sum of its components', () => {
  const s = defaultSettings();
  assert.equal(Math.round(ctcAllowanceRate(s.ctc) * 1000) / 1000, 0.1,
    'the shipped components sum to the 10% default');
  s.ctc.allowanceComponents = { marketing: 0.05, admin: 0.02, rnd: 0.02, storage: 0.01 };
  assert.equal(Math.round(ctcAllowanceRate(s.ctc) * 1000) / 1000, 0.1);
});

test('an old workshop with only a single allowance rate keeps that total on migration', () => {
  // A stored settings from before the components existed, at a non-default 18%.
  const old = defaultSettings();
  delete old.ctc.allowanceComponents;
  old.ctc.generalAllowance = 0.18;
  const migrated = migrateSettings(old);
  assert.ok(migrated.ctc.allowanceComponents, 'components are filled in');
  assert.equal(Math.round(ctcAllowanceRate(migrated.ctc) * 1000) / 1000, 0.18,
    'the total allowance is preserved exactly, so no price moves');
  assert.equal(Math.round(migrated.ctc.generalAllowance * 1000) / 1000, 0.18,
    'the cached single rate is kept in sync with the sum');
});

test('a stored company logo survives migration (default is null)', () => {
  const s = defaultSettings();
  s.company.logo = 'data:image/png;base64,AAAA';
  const migrated = migrateSettings(s);
  assert.equal(migrated.company.logo, 'data:image/png;base64,AAAA',
    'the uploaded logo is not discarded by the merge');
});

test('a stored electricity tariff survives migration (default is null)', () => {
  const s = defaultSettings();
  s.electricityAlternativeId = 'small-business-single-phase';
  const migrated = migrateSettings(s);
  assert.equal(migrated.electricityAlternativeId, 'small-business-single-phase',
    'the chosen alternative tariff is not reset to the default');
});

test('migration fills a missing default printer with a real, unarchived machine', () => {
  const s = defaultSettings();
  delete s.defaultPrinterId;
  const migrated = migrateSettings(s);
  assert.ok(migrated.defaultPrinterId);
  const chosen = migrated.printers.find((p) => p.id === migrated.defaultPrinterId);
  assert.ok(chosen && !chosen.archived, 'points at a machine that still exists and is not archived');
});

test('migration repoints a default printer that no longer exists', () => {
  const s = defaultSettings();
  s.defaultPrinterId = 'a-printer-that-was-deleted';
  const migrated = migrateSettings(s);
  assert.ok(migrated.printers.some((p) => p.id === migrated.defaultPrinterId),
    'the dangling id is replaced with a real one');
});
