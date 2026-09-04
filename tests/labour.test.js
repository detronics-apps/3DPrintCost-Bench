/**
 * The effective labour rate.
 *
 * Two ways to set it: a direct rate, or one worked out from a monthly salary and
 * the share of paid hours that are billable. The billable share is the point -
 * idle time is real cost, so a lower billable share must RAISE the rate, and a
 * half-filled salary must never yield a rate of zero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLabourRate } from '../js/labour.js';

test('direct mode uses the typed rate when it is above zero', () => {
  assert.equal(resolveLabourRate({ rateMode: 'direct', rate: 150 }, 45), 150);
});

test('direct mode falls back to the country default when the rate is zero', () => {
  assert.equal(resolveLabourRate({ rateMode: 'direct', rate: 0 }, 45), 45);
});

test('salary mode recovers the salary over the billable hours', () => {
  // R30 000 a month, 160 paid hours, 70% billable => 112 chargeable hours.
  const rate = resolveLabourRate({
    rateMode: 'salary',
    salary: { monthly: 30000, hoursPerMonth: 160, billablePercent: 0.7 },
  }, 45);
  assert.ok(Math.abs(rate - 30000 / 112) < 1e-9, `${rate} should be 30000/112`);
});

test('a lower billable share raises the rate for the same salary', () => {
  const salary = { monthly: 30000, hoursPerMonth: 160 };
  const high = resolveLabourRate({ rateMode: 'salary', salary: { ...salary, billablePercent: 0.9 } }, 45);
  const low = resolveLabourRate({ rateMode: 'salary', salary: { ...salary, billablePercent: 0.5 } }, 45);
  assert.ok(low > high, 'fewer billable hours must cost more per hour');
});

test('100% billable is just salary over the paid hours', () => {
  const rate = resolveLabourRate({
    rateMode: 'salary',
    salary: { monthly: 16000, hoursPerMonth: 160, billablePercent: 1 },
  }, 45);
  assert.equal(rate, 100);
});

test('an unfinished salary falls back to the country default, never zero', () => {
  const base = { rateMode: 'salary', salary: { monthly: 0, hoursPerMonth: 160, billablePercent: 0.7 } };
  assert.equal(resolveLabourRate(base, 45), 45, 'no salary yet');
  assert.equal(resolveLabourRate({ ...base, salary: { monthly: 30000, hoursPerMonth: 0, billablePercent: 0.7 } }, 45), 45, 'no hours');
  assert.equal(resolveLabourRate({ ...base, salary: { monthly: 30000, hoursPerMonth: 160, billablePercent: 0 } }, 45), 45, 'nothing billable');
});

test('billable share is clamped so a bad input cannot invert the rate', () => {
  const over = resolveLabourRate({
    rateMode: 'salary',
    salary: { monthly: 16000, hoursPerMonth: 160, billablePercent: 2 },
  }, 45);
  assert.equal(over, 100, 'a share above 100% is treated as 100%');
});

test('a missing or malformed labour block is the country default', () => {
  assert.equal(resolveLabourRate(null, 45), 45);
  assert.equal(resolveLabourRate(undefined, 45), 45);
  assert.equal(resolveLabourRate({}, 45), 45);
});
