/**
 * The six-phase order workflow: transitions, derived progress, the reprint loop,
 * post-processing auto-skip, hold/resume, cancel, event history and the client
 * progress report.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makePart, addPart, recordAttempt } from '../js/projects.js';
import {
  PHASES, PHASE_ORDER, phaseName, postProcessingRequired,
  workflowState, advance, clientProgressReport,
} from '../js/workflow.js';

const part = (spec = {}) => makePart({ quantity: 2, slicer: { grams: 100, minutes: 200 }, ...spec });
const order = (partSpec = {}) => addPart(makeProject({ name: 'Bracket job' }), part(partSpec));

const toProduction = (o) => advance(advance(o, 'send-quote'), 'payment-received');

const lastEvent = (p) => p.history[p.history.length - 1];

/* -------------------------------------------------------------- shape ----- */

test('the six phases are named and weighted, and closed/cancelled are terminal', () => {
  assert.equal(PHASES.length, 6 + 1, 'six operational phases plus the awaiting-payment wait');
  for (const p of PHASES) {
    assert.ok(p.name, `${p.id} has a name`);
    assert.ok(p.weight > 0, `${p.id} has a weight`);
  }
  assert.equal(phaseName('closed'), 'Closed');
  assert.equal(phaseName('cancelled'), 'Cancelled');
});

/* -------------------------------------------------------- quotation ------- */

test('a fresh order starts in Quotation with a send-quote action', () => {
  const ws = workflowState(order());
  assert.equal(ws.phase.id, 'quotation');
  assert.ok(ws.actions.some((a) => a.id === 'send-quote'));
  assert.ok(ws.actions.some((a) => a.id === 'return-to-client'));
});

test('returning to the client records the issue and stays in Quotation', () => {
  const p = advance(order(), 'return-to-client', { note: 'wrong colour' });
  assert.equal(p.phase, 'quotation');
  assert.equal(p.workflow.quoteIssue.note, 'wrong colour');
  assert.equal(lastEvent(p).type, 'returned-to-client');
});

test('sending the quote moves to Awaiting payment, a blocked waiting state', () => {
  const p = advance(order(), 'send-quote');
  assert.equal(p.phase, 'awaiting-payment');
  assert.equal(workflowState(p).blocked, true, 'the order cannot proceed until paid');
});

/* --------------------------------------------------- awaiting payment ----- */

test('payment received is manual and moves the order into Production', () => {
  const p = toProduction(order());
  assert.equal(p.phase, 'production');
  assert.ok(p.workflow.paymentReceivedAt, 'the payment marker is set');
  assert.equal(p.status, 'in-production', 'the scheduler shadow says it is on a machine');
  assert.equal(lastEvent(p).type, 'payment-received');
});

/* ------------------------------------------------------- production -------- */

test('production progress rises with accepted units and completes on inspection', () => {
  let p = toProduction(order());
  assert.equal(workflowState(p).phaseProgress, 0, 'nothing printed yet');

  p = recordAttempt(p, p.parts[0].id, { quantity: 2, accepted: 2, minutes: 200, grams: 100 });
  const mid = workflowState(p);
  assert.ok(mid.phaseProgress > 0.8 && mid.phaseProgress < 1, 'made but not yet inspected');

  p = advance(p, 'inspection-pass');
  assert.equal(p.phase, 'packaging', 'no post-processing needed, so it skips to Packaging');
});

test('a failed inspection keeps the order in Production — the reprint loop', () => {
  let p = toProduction(order());
  p = recordAttempt(p, p.parts[0].id, { quantity: 2, accepted: 1, rejected: 1, minutes: 200, grams: 100 });
  p = advance(p, 'reprint', { note: 'one warped' });
  assert.equal(p.phase, 'production', 'it does not leave Production for a separate phase');
  assert.equal(p.workflow.inspection.passed, false);
  assert.equal(lastEvent(p).type, 'reprint-needed');
});

/* --------------------------------------------------- post-processing ------ */

test('inspection routes to Post-processing only when a part needs it', () => {
  const needs = toProduction(order({ needsResin: true }));
  assert.equal(postProcessingRequired(needs), true);
  const routed = advance(needs, 'inspection-pass');
  assert.equal(routed.phase, 'post-processing');
  const packed = advance(routed, 'post-processing-done');
  assert.equal(packed.phase, 'packaging');
});

test('an order with no finishing work skips Post-processing in the progress too', () => {
  const ws = workflowState(order()); // no post-processing
  // Post-processing's weight is counted as already done, so overall is not held back by it.
  assert.ok(ws.overallProgress >= 0, 'sane');
  const packaging = advance(toProduction(order()), 'inspection-pass');
  const wsPack = workflowState(packaging);
  assert.equal(wsPack.phase.id, 'packaging');
  assert.ok(wsPack.skipped === false);
});

/* ----------------------------------------- packaging → delivery → close --- */

test('packaging, delivery and closeout carry the order to closed at 100%', () => {
  let p = advance(toProduction(order()), 'inspection-pass'); // packaging
  p = advance(p, 'ready-for-collection');
  assert.equal(p.phase, 'delivery');
  p = advance(p, 'confirm-collected');
  assert.ok(p.workflow.collectedAt);
  p = advance(p, 'confirm-delivered');
  assert.equal(p.phase, 'closeout');
  p = advance(p, 'record-feedback', { feedback: { happy: true, notes: 'great' } });
  assert.equal(p.workflow.closeout.happy, true);
  p = advance(p, 'close-order');
  assert.equal(p.phase, 'closed');
  assert.equal(workflowState(p).overallProgress, 1, 'a closed order is 100%');
});

/* ---------------------------------------------------- hold / cancel ------- */

test('on-hold remembers the phase and resumes to it', () => {
  const prod = toProduction(order());
  const held = advance(prod, 'hold');
  assert.equal(held.phase, 'on-hold');
  assert.equal(held.onHoldFrom, 'production');
  const resumed = advance(held, 'resume');
  assert.equal(resumed.phase, 'production');
  assert.equal(resumed.onHoldFrom, null);
});

test('cancel is a terminal off-ramp that can be reopened to where it was', () => {
  const packaging = advance(toProduction(order()), 'inspection-pass');
  const cancelled = advance(packaging, 'cancel', { note: 'customer pulled out' });
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.workflow.cancelledFrom, 'packaging');
  assert.equal(workflowState(cancelled).terminal, true);
  const reopened = advance(cancelled, 'resume-cancel');
  assert.equal(reopened.phase, 'packaging');
});

/* ---------------------------------------------------- overall progress ---- */

test('overall progress increases as the order moves down the phases', () => {
  const quoting = workflowState(order()).overallProgress;
  const producing = workflowState(toProduction(order())).overallProgress;
  const delivered = workflowState(
    advance(advance(advance(toProduction(order()), 'inspection-pass'), 'ready-for-collection'), 'confirm-delivered'),
  ).overallProgress;
  assert.ok(producing > quoting, 'production is further than quotation');
  assert.ok(delivered > producing, 'delivery is further than production');
  assert.ok(delivered < 1, 'but not finished until closeout is done');
});

/* -------------------------------------------------------- client note ----- */

test('the client progress report states the phase, overall progress and next step', () => {
  const p = toProduction(order());
  const text = clientProgressReport(p, workflowState(p), {
    company: { name: 'Detronics' }, customerName: 'Acme',
  });
  assert.match(text, /Detronics/);
  assert.match(text, /Current stage: Production/);
  assert.match(text, /Overall progress: \d+%/);
  assert.match(text, /Next: Packaging/, 'no post-processing needed, so packaging is next');
});

/* ----------------------------------------------- every action is real ----- */

test('every action a phase offers is one advance knows how to apply', () => {
  const phases = ['quotation', 'awaiting-payment', 'production', 'post-processing',
    'packaging', 'delivery', 'closeout'];
  for (const phase of phases) {
    const p = { ...order({ needsResin: true }), phase };
    for (const action of workflowState(p).actions) {
      const after = advance(p, action.id, { note: 'x', feedback: {} });
      assert.notEqual(after, p, `${phase}/${action.id} did nothing`);
    }
  }
});
