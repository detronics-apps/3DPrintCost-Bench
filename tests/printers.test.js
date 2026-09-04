/**
 * Machine payback vs expected life.
 *
 * The capital in a machine-hour is recovered over the PAYBACK hours, which
 * default to the full expected life. Choosing a shorter payback must raise the
 * machine-hour cost - and only the capital part of it, never the maintenance,
 * parts or overhead - so a printer good for years can still be priced to pay
 * itself off inside its first few hundred printing hours.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { machineHourCost, lifetimeHours, paybackHours } from '../js/printers.js';

const base = {
  id: 'p', purchasePrice: 46000, residualValue: 6000,
  serviceLifeYears: 2, hoursPerYear: 1200, // 2400 h of life
  maintenancePerYear: 2400, replacementPartsPerYear: 1200, overheadPerHour: 1,
  paybackHoursOverride: null,
};

test('with no payback set, capital is spread over the full life', () => {
  assert.equal(lifetimeHours(base), 2400);
  assert.equal(paybackHours(base), 2400, 'payback falls back to the life');
  const rate = machineHourCost(base);
  // (46000 − 6000) / 2400 = 16.666…
  assert.ok(Math.abs(rate.depreciation - 40000 / 2400) < 1e-9);
  assert.equal(rate.paybackHours, 2400);
  assert.equal(rate.lifetimeHours, 2400);
});

test('a shorter payback recovers the capital over those hours instead', () => {
  const fast = { ...base, paybackHoursOverride: 500 };
  assert.equal(lifetimeHours(fast), 2400, 'the life itself is unchanged');
  assert.equal(paybackHours(fast), 500);
  const rate = machineHourCost(fast);
  assert.ok(Math.abs(rate.depreciation - 40000 / 500) < 1e-9, 'capital over 500 h');
});

test('the payback only moves the capital part, not maintenance, parts or overhead', () => {
  const slow = machineHourCost(base);
  const fast = machineHourCost({ ...base, paybackHoursOverride: 500 });
  assert.equal(fast.maintenance, slow.maintenance);
  assert.equal(fast.parts, slow.parts);
  assert.equal(fast.overhead, slow.overhead);
  assert.ok(fast.depreciation > slow.depreciation, 'the machine-hour is dearer under a fast payback');
  assert.ok(fast.total > slow.total);
});

test('recovering over 500 h earns the capital back in 500 printing hours', () => {
  const fast = machineHourCost({ ...base, paybackHoursOverride: 500 });
  const capital = base.purchasePrice - base.residualValue;
  assert.ok(Math.abs(fast.depreciation * 500 - capital) < 1e-6);
});

test('a zero or missing payback override is treated as no override', () => {
  assert.equal(paybackHours({ ...base, paybackHoursOverride: 0 }), 2400);
  assert.equal(paybackHours({ ...base, paybackHoursOverride: null }), 2400);
  const { paybackHoursOverride, ...without } = base;
  assert.equal(paybackHours(without), 2400);
});
