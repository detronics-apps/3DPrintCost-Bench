import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sig, fmtNum, fmtSigned, fmtPct, unit, gcd, reduceRatio, fmtRatio,
} from '../js/format.js';

test('sig rounds to significant figures, not decimal places', () => {
  assert.equal(sig(19.6078431373, 3), 19.6);
  assert.equal(sig(0.00123456, 3), 0.00123);
  assert.equal(sig(123456, 2), 120000);
  assert.equal(sig(-4.5678, 3), -4.57);
  assert.equal(sig(0, 4), 0);
});

test('sig is safe on non-numbers', () => {
  assert.equal(sig(NaN), 0);
  assert.equal(sig(Infinity), 0);
});

test('fmtNum never leaks full float precision into prose', () => {
  // The bug this exists to prevent: "draws 19.6078431373 mA".
  assert.equal(fmtNum(19.6078431373, 3), '19.6');
  assert.equal(fmtNum(1 / 3, 4), '0.3333');
  assert.equal(fmtNum(1500, 4), '1500');
  assert.equal(fmtNum(0), '0');
  assert.equal(fmtNum(NaN), '—');
});

test('fmtNum trims trailing zeros but keeps the value exact', () => {
  assert.equal(fmtNum(2.5, 4), '2.5');
  assert.equal(fmtNum(2.0, 4), '2');
  assert.equal(fmtNum(60.00001, 4), '60');
});

test('fmtSigned uses a real minus sign and collapses float noise to zero', () => {
  assert.equal(fmtSigned(12.3), '+12.3');
  assert.equal(fmtSigned(-12.3), '−12.3');
  assert.equal(fmtSigned(1e-15), '0');
});

test('fmtPct', () => {
  assert.equal(fmtPct(2.13456), '+2.13%');
  assert.equal(fmtPct(0), '0%');
  assert.equal(fmtPct(NaN), '—');
});

test('unit builds an app-specific helper without repeating the rounding', () => {
  const volts = unit('V');
  assert.equal(volts(3.30001), '3.3 V');
  assert.equal(volts(1 / 3, 2), '0.33 V');
  assert.equal(unit('rpm')(1500), '1500 rpm');
});

test('gcd and reduceRatio put a whole-number pair in lowest terms', () => {
  assert.equal(gcd(40, 16), 8);
  assert.equal(gcd(17, 5), 1);
  assert.deepEqual(reduceRatio(40, 16), { a: 5, b: 2, divisor: 8 });
  assert.deepEqual(reduceRatio(17, 5), { a: 17, b: 5, divisor: 1 });
});

test('fmtRatio always writes the larger side out', () => {
  assert.equal(fmtRatio(3.75), '3.75 : 1');
  assert.equal(fmtRatio(-3.75), '3.75 : 1');
  assert.equal(fmtRatio(0.25), '1 : 4');
  assert.equal(fmtRatio(0), '—');
});
