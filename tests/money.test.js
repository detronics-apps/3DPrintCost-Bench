import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENCIES, currency, num, round, fmtMoney, fmtRate, parsePercent, tax, sum,
} from '../js/money.js';

test('currency falls back by name, never by position', () => {
  // pitfalls #16: an unknown id must not resolve to whatever happens to be
  // first in the table.
  assert.equal(currency('ZAR').code, 'ZAR');
  assert.equal(currency('nonsense').code, 'ZAR');
  assert.equal(currency(undefined).code, 'ZAR');
});

test('every currency declares a minor unit', () => {
  for (const [code, cur] of Object.entries(CURRENCIES)) {
    assert.equal(cur.code, code, `${code} disagrees with its key`);
    assert.ok(Number.isInteger(cur.minor) && cur.minor >= 0, `${code} minor`);
    assert.ok(cur.symbol && cur.name, `${code} symbol/name`);
  }
});

test('num rejects junk rather than propagating NaN', () => {
  assert.equal(num('12.5'), 12.5);
  assert.equal(num('1 234,5'.replace(',', '.')), 1234.5);
  assert.equal(num(''), 0);
  assert.equal(num(null), 0);
  assert.equal(num('abc', 7), 7);
  assert.equal(num(Infinity, 3), 3);
});

test('round lands on the cent, including the binary-boundary cases', () => {
  assert.equal(round(9.905), 9.91);
  assert.equal(round(1.005), 1.01);
  assert.equal(round(2.675), 2.68);
  assert.equal(round(-1.005), -1.0);   // symmetric with Math.round, and stated
  assert.equal(round(29.699999999999996), 29.7);
});

test('fmtMoney groups thousands and marks the sign', () => {
  assert.equal(fmtMoney(1234.5), 'R1\u202f234.50');
  assert.equal(fmtMoney(90, 'ZAR'), 'R90.00');
  assert.equal(fmtMoney(-90), '\u2212R90.00');
  assert.equal(fmtMoney(12, 'EUR'), '\u20ac12.00');
  assert.equal(fmtMoney(5, 'ZAR', { sign: true }), '+R5.00');
});

test('percentages round-trip through parse and format', () => {
  assert.equal(parsePercent('15'), 0.15);
  assert.equal(parsePercent('15%'), 0.15);
  assert.equal(parsePercent(10), 0.1);
  assert.equal(fmtRate(0.155), '15.5%');
  assert.equal(fmtRate(0.1), '10%');
  assert.equal(fmtRate(parsePercent('12.5')), '12.5%');
});

test('tax works in both directions and the two agree', () => {
  const exclusive = tax(100, 0.15);
  assert.equal(exclusive.net, 100);
  assert.equal(round(exclusive.tax), 15);
  assert.equal(round(exclusive.gross), 115);

  const inclusive = tax(115, 0.15, { inclusive: true });
  assert.equal(round(inclusive.net), 100);
  assert.equal(round(inclusive.tax), 15);
  assert.equal(inclusive.gross, 115);

  // Adding tax then extracting it must return the original net.
  assert.equal(round(tax(exclusive.gross, 0.15, { inclusive: true }).net), 100);
});

test('a zero rate is a no-op in both directions', () => {
  assert.deepEqual(tax(50, 0).gross, 50);
  assert.deepEqual(tax(50, 0, { inclusive: true }).net, 50);
});

test('sum tolerates one bad field rather than NaN-ing the invoice', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([1, undefined, '2', null]), 3);
});
