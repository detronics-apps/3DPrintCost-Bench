/**
 * How long orders take in each phase, reconstructed from the history trail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderPhaseTimes, phaseTimeSummary, fmtSpan } from '../js/phasetime.js';

const H = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// An order created at t0, quoted (→awaiting-payment) 2 h later, paid
// (→production) 3 h after that.
function order(t0) {
  return {
    id: 'p1',
    createdAt: iso(t0),
    phase: 'production',
    order: {},
    history: [
      { id: 'e1', at: iso(t0 + 2 * H), type: 'quote-sent', phaseFrom: 'quotation', phaseTo: 'awaiting-payment' },
      { id: 'e2', at: iso(t0 + 5 * H), type: 'payment-received', phaseFrom: 'awaiting-payment', phaseTo: 'production' },
    ],
  };
}

test('time in each phase is measured between transitions', () => {
  const t0 = Date.UTC(2026, 0, 5, 8, 0, 0);
  const now = t0 + 9 * H; // 4 h into production
  const { byPhase, open } = orderPhaseTimes(order(t0), now);
  assert.equal(byPhase.quotation, 2 * H, '2 h in quotation');
  assert.equal(byPhase['awaiting-payment'], 3 * H, '3 h waiting for payment');
  assert.equal(byPhase.production, 4 * H, 'production runs to now');
  assert.equal(open, 'production', 'and production is still open');
});

test('a closed order stops the clock at its last event', () => {
  const t0 = Date.UTC(2026, 0, 5, 8, 0, 0);
  const closed = {
    ...order(t0),
    phase: 'closed',
    history: [
      ...order(t0).history,
      { id: 'e3', at: iso(t0 + 10 * H), type: 'closed', phaseFrom: 'production', phaseTo: 'closed' },
    ],
  };
  const { byPhase, open } = orderPhaseTimes(closed, t0 + 999 * H);
  assert.equal(byPhase.production, 5 * H, 'production is 5 h, not run to now');
  assert.equal(open, null, 'nothing is open on a closed order');
});

test('the summary averages across orders and surfaces the slowest phase', () => {
  const t0 = Date.UTC(2026, 0, 5, 8, 0, 0);
  const now = t0 + 9 * H;
  const s = phaseTimeSummary([order(t0), order(t0)], now);
  const waiting = s.rows.find((r) => r.phase === 'awaiting-payment');
  assert.equal(waiting.orders, 2);
  assert.equal(waiting.averageMs, 3 * H);
  assert.equal(s.slowest.phase, 'production', 'production (4 h) is the slowest here');
});

test('cancelled orders are left out of the summary', () => {
  const t0 = Date.UTC(2026, 0, 5, 8, 0, 0);
  const cancelled = { ...order(t0), phase: 'cancelled' };
  const s = phaseTimeSummary([cancelled], t0 + 9 * H);
  assert.equal(s.orders, 0);
  assert.equal(s.rows.length, 0);
});

test('fmtSpan reads in minutes, hours or days', () => {
  assert.equal(fmtSpan(30 * 60 * 1000), '30 min');
  assert.equal(fmtSpan(5 * H), '5.0 h');
  assert.equal(fmtSpan(72 * H), '3.0 days');
});
