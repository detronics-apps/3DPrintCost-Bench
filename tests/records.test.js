import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeProject, makePart, makeCustomer, addPart, updatePart, removePart,
  duplicatePart, duplicateProject, nextRevision, setStatus, archiveProject,
  recordAttempt, removeAttempt, partStats, projectStats, migrateProject, orderFromProject,
  PROJECT_STATUSES, statusOf, statusFromPhase, phaseFromStatus,
} from '../js/projects.js';
import {
  makeQuote, invoiceFromQuote, recordPayment, agreeTotal, outstanding, isOverdue, lockedPricing,
  displayStatus, reprice, assumptionDrift, documentRows, snapshotAssumptions,
  QUOTE_STATUSES, INVOICE_STATUSES,
} from '../js/documents.js';
import {
  makeSpool, makeStockItem, makeMovement, balances, balanceOf, lowStock,
  movementsForRun, movementsForDespatch, stockValue, spoolsFor, MOVEMENT_REASONS, reason,
} from '../js/inventory.js';
import { calibrate, samplesFrom, correctionFor, errorReport, DEFAULT_CALIBRATION } from '../js/calibration.js';
import { dashboard, committedLoad, revenueByMonth } from '../js/analytics.js';
import { defaultSettings, clone } from '../js/settings.js';
import { calculateOrder } from '../js/engine.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

const samplePart = (spec = {}) => makePart({
  name: 'Bracket',
  quantity: 4,
  profileId: 'function',
  printerId: 'bambu-x1e',
  materialId: 'petg-dark-grey',
  geometry: analyse(box(50, 50, 20)),
  ...spec,
});

/* ------------------------------------------------------------- projects -- */

test('every edit returns a new project and leaves the old one alone', () => {
  const before = makeProject({ name: 'Job' });
  const after = addPart(before, samplePart());
  assert.equal(before.parts.length, 0, 'the original must be untouched');
  assert.equal(after.parts.length, 1);
  assert.notEqual(before.modifiedAt === after.modifiedAt && before.parts === after.parts, true);
});

test('parts can be added, edited and removed by id', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  project = updatePart(project, id, { quantity: 12 });
  assert.equal(project.parts[0].quantity, 12);
  project = removePart(project, id);
  assert.equal(project.parts.length, 0);
});

test('duplicating a part does not inherit its production history', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  project = recordAttempt(project, id, { quantity: 4, accepted: 3, rejected: 1, minutes: 200, grams: 120 });
  project = duplicatePart(project, id);

  assert.equal(project.parts.length, 2);
  assert.equal(project.parts[0].attempts.length, 1);
  assert.equal(project.parts[1].attempts.length, 0,
    'a part that has never been printed must not borrow a success rate');
  assert.equal(project.parts[1].revision, 'B');
});

test('revisions advance A -> B, Z -> AA', () => {
  assert.equal(nextRevision('A'), 'B');
  assert.equal(nextRevision('Z'), 'AA');
  assert.equal(nextRevision('AZ'), 'BA');
  assert.equal(nextRevision(''), 'A');
  assert.equal(nextRevision('12'), 'A');
});

test('status changes are recorded with what they came from', () => {
  const project = setStatus(makeProject(), 'quoted', 'Sent to customer');
  assert.equal(project.status, 'quoted');
  assert.equal(project.history[0].from, 'draft');
  assert.equal(project.history[0].to, 'quoted');
  assert.equal(archiveProject(project).status, 'archived');
});

test('every status a project can hold has a name and a tone the UI honours', () => {
  const tones = new Set(['info', 'ok', 'warn', 'danger']);
  for (const list of [PROJECT_STATUSES, QUOTE_STATUSES, INVOICE_STATUSES]) {
    for (const status of list) {
      assert.ok(status.name, `${status.id} has no name`);
      assert.ok(tones.has(status.tone), `${status.id} has tone "${status.tone}"`);
    }
  }
  assert.equal(statusOf('nonsense').id, 'draft', 'unknown falls back by name');
});

test('an old status migrates onto the right workflow phase', () => {
  assert.equal(migrateProject({ status: 'draft' }).phase, 'quotation');
  assert.equal(migrateProject({ status: 'quoted' }).phase, 'quotation');
  assert.equal(migrateProject({ status: 'accepted' }).phase, 'awaiting-payment');
  assert.equal(migrateProject({ status: 'invoiced' }).phase, 'awaiting-payment');
  assert.equal(migrateProject({ status: 'paid' }).phase, 'production');
  assert.equal(migrateProject({ status: 'in-production' }).phase, 'production');
  assert.equal(migrateProject({ status: 'complete' }).phase, 'closeout');
  assert.equal(migrateProject({ status: 'archived' }).phase, 'closed');
});

test('a project already on the phase model keeps its phase and markers', () => {
  const already = migrateProject({ phase: 'delivery', workflow: { collectedAt: 'x' } });
  assert.equal(already.phase, 'delivery');
  assert.equal(already.workflow.collectedAt, 'x');
  assert.ok('paymentReceivedAt' in already.workflow, 'the rest of the markers default in');
  assert.equal(already.status, 'complete', 'the shadow status follows the phase');
});

test('phase and status shadow map to each other for the scheduler', () => {
  assert.equal(statusFromPhase('production'), 'in-production', 'only production is on a machine');
  assert.equal(statusFromPhase('awaiting-payment'), 'quoted', 'not yet queued');
  assert.equal(statusFromPhase('closed'), 'archived');
  assert.equal(phaseFromStatus('paid'), 'production');
  const tones = new Set(['info', 'ok', 'warn', 'danger']);
  for (const s of PROJECT_STATUSES) assert.ok(tones.has(s.tone), `${s.id} tone`);
});

test('part statistics compare estimate with actual as a ratio', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  project = recordAttempt(project, id, {
    quantity: 4, accepted: 3, rejected: 1, minutes: 240, grams: 160,
    estimatedMinutes: 200, estimatedGrams: 200, costPerAttempt: 10,
  });
  const stats = partStats(project.parts[0]);

  assert.equal(stats.printed, 4);
  assert.equal(stats.accepted, 3);
  close(stats.rejectionRate, 0.25, 1e-9, 'rejection rate');
  close(stats.timeRatio, 1.2, 1e-9, 'time ratio');
  close(stats.materialRatio, 0.8, 1e-9, 'material ratio');
  close(stats.costPerAccepted, 40 / 3, 1e-9, 'cost per accepted');

  const rolled = projectStats(project);
  assert.equal(rolled.accepted, 3);
});

test('a recorded print can be deleted by id, leaving the others', () => {
  let project = addPart(makeProject(), samplePart());
  const partId = project.parts[0].id;
  project = recordAttempt(project, partId, { quantity: 1, accepted: 1, minutes: 100, grams: 50 });
  project = recordAttempt(project, partId, { quantity: 1, accepted: 1, minutes: 110, grams: 55 });
  const [first, second] = project.parts[0].attempts;

  const after = removeAttempt(project, partId, first.id);
  assert.equal(after.parts[0].attempts.length, 1, 'one print is gone');
  assert.equal(after.parts[0].attempts[0].id, second.id, 'the right one remained');
  assert.equal(project.parts[0].attempts.length, 2, 'the original project is untouched');
});

test('deleting a missing attempt is a no-op that changes nothing important', () => {
  let project = addPart(makeProject(), samplePart());
  const partId = project.parts[0].id;
  project = recordAttempt(project, partId, { quantity: 1, accepted: 1, minutes: 100, grams: 50 });
  const after = removeAttempt(project, partId, 'no-such-run');
  assert.equal(after.parts[0].attempts.length, 1);
});

test('the movements a print books out carry the run id, so a delete can reverse them', () => {
  const settings = defaultSettings();
  const part = samplePart({ hardware: [{ hardwareId: 'magnet-6x3', qty: 2 }] });
  let project = addPart(makeProject(), part);
  project = recordAttempt(project, part.id, { quantity: 4, accepted: 4, grams: 160 });
  const created = project.parts[0].attempts.at(-1);

  const movements = movementsForRun({
    project, part, attempt: created, settings,
  });
  assert.ok(movements.length >= 1);
  assert.ok(movements.every((m) => m.runId === created.id),
    'every movement is tagged with the attempt it belongs to');

  // The delete reverses exactly this run's movements and no other.
  const other = makeMovement({ itemId: 'material:petg-dark-grey', reason: 'purchase', quantity: 1000 });
  const log = [...movements, other];
  const afterDelete = log.filter((m) => m.runId !== created.id);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, other.id, 'unrelated stock is left alone');
});

test('a part never printed reports no data rather than a confident zero', () => {
  const stats = partStats(samplePart());
  assert.equal(stats.hasData, false);
  assert.equal(stats.rejectionRate, null);
  assert.equal(stats.timeRatio, null);
  assert.equal(stats.costPerAccepted, null);
});

test('an old project file migrates, tested against a literal old blob', () => {
  const ancient = {
    name: 'From an old build',
    status: 'quoted',
    parts: [{
      name: 'Old part',
      quantity: 2,
      material: 'pla-dark-grey',
      printer: 'ender-3',
      runs: [{ time: 90, material: 40, ok: 2, bad: 0 }],
    }],
  };
  const project = migrateProject(ancient);
  assert.equal(project.version, 1);
  assert.equal(project.parts[0].materialId, 'pla-dark-grey');
  assert.equal(project.parts[0].printerId, 'ender-3');
  assert.equal(project.parts[0].material, undefined);
  assert.equal(project.parts[0].attempts.length, 1);
  assert.equal(project.parts[0].attempts[0].minutes, 90);
  assert.ok(project.order, 'the order block is filled in');
});

test('a project becomes an order the engine can price', () => {
  const project = addPart(makeProject(), samplePart());
  const order = orderFromProject(project);
  const result = calculateOrder(order, defaultSettings());
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].quantity, 4);
  assert.equal(result.separation.ok, true);
});

test('a project part with no loaded heads still prices as a single filament', () => {
  const project = addPart(makeProject(), samplePart());
  const result = calculateOrder(orderFromProject(project), defaultSettings());
  assert.equal(result.lines[0].filaments.length, 1, 'unchanged single-colour behaviour');
});

test('per-head slicer grams are TOTALS: divided across the quantity, and they override the mix', () => {
  const settings = defaultSettings();
  const part = samplePart({
    quantity: 4,
    printerId: 'snapmaker-u1',
    slots: [{ id: 's1', materialId: 'petg-dark-grey' }, { id: 's2', materialId: 'pla-dark-grey' }],
    mix: [{ slotId: 's1', percent: 50 }, { slotId: 's2', percent: 50 }],
    // The slicer's TOTAL for the whole print of four: 280 g PETG + 120 g PLA.
    slicer: { grams: 400, minutes: 800, heads: [{ slotId: 's1', grams: 280 }, { slotId: 's2', grams: 120 }] },
  });
  const line = calculateOrder(orderFromProject(addPart(makeProject(), part)), settings).lines[0];
  assert.equal(line.estimate.method, 'slicer', 'the sliced figures are the ones in use');
  const one = line.filaments.find((f) => f.slotId === 's1');
  const two = line.filaments.find((f) => f.slotId === 's2');
  close(one.grams, 70, 1e-9, 'per part is the total ÷ quantity (280 / 4), not the whole 280');
  close(two.grams, 30, 1e-9, 'likewise for the second head (120 / 4)');
  // The order as a whole uses the slicer total, never total × quantity.
  const orderG = line.filaments.reduce((t, f) => t + f.grams, 0) * line.quantity;
  close(orderG, 400, 1e-9, 'the order material is 400 g, not 400 × 4');
});

test('a flat slicer total is divided across the quantity, not multiplied by it', () => {
  const settings = defaultSettings();
  const part = samplePart({ quantity: 5, slicer: { grams: 500, minutes: 1000 } });
  const line = calculateOrder(orderFromProject(addPart(makeProject(), part)), settings).lines[0];
  assert.equal(line.estimate.method, 'slicer');
  close(line.estimate.minutes, 200, 1e-9, 'per-part print time is the total (1000) over the quantity (5)');
  close(line.filaments[0].grams, 100, 0.6, 'per-part material is the total (500) over the quantity (5)');
});

test('a project part carries its loaded heads, and the engine prices every one', () => {
  const settings = defaultSettings();
  const part = samplePart({
    printerId: 'snapmaker-u1',
    slots: [{ id: 's1', materialId: 'petg-dark-grey' }, { id: 's2', materialId: 'pla-dark-grey' }],
    mix: [{ slotId: 's1', percent: 60 }, { slotId: 's2', percent: 40 }],
  });
  const project = addPart(makeProject(), part);
  const line = orderFromProject(project).lines[0];
  assert.equal(line.slots.length, 2, 'both heads travel to the engine');
  assert.equal(line.mix.length, 2, 'and this part’s share of each');

  const result = calculateOrder(orderFromProject(project), settings);
  assert.equal(result.lines[0].filaments.length, 2, 'both filaments are priced');
  assert.equal(result.separation.ok, true);
});

/* ------------------------------------------------------------ documents -- */

const pricedQuote = (settingsOverrides = {}) => {
  const settings = { ...defaultSettings(), ...settingsOverrides };
  const project = addPart(makeProject({ name: 'Bracket job' }), samplePart());
  const order = orderFromProject(project);
  const result = calculateOrder(order, settings);
  const customer = makeCustomer({ name: 'Acme' });
  return {
    settings,
    project,
    order,
    result,
    quote: makeQuote({ number: 'Q2026-0001', project, customer, result, order, settings }),
  };
};

test('a quote carries the customer numbers and keeps the internal ones apart', () => {
  const { quote, result } = pricedQuote();
  close(quote.total, result.totals.finalInvoice, 1e-9, 'total');
  close(quote.parts, result.parts.total, 1e-9, 'parts');
  assert.equal(quote.lines.length, 1);

  // Nothing internal may appear on a customer line.
  const text = JSON.stringify(quote.lines);
  assert.ok(!/ctc|profit|margin|allocation/i.test(text), `a line leaked internals: ${text}`);
  assert.ok(quote.internal.costToCompany > 0, 'and the internal block still has them');
});

test('a quote does not change when company settings later change', () => {
  const { quote, settings } = pricedQuote();
  const before = quote.total;

  const later = clone(settings);
  later.ctc.generalAllowance = 0.5;
  later.materials.find((m) => m.id === 'petg-dark-grey').priceOverride = 4000;

  assert.equal(quote.total, before, 'the stored document must not move');
  const drift = assumptionDrift(quote, later);
  assert.ok(drift.some((d) => d.label === 'CTC allowance'), 'and the drift must be visible');
  assert.ok(drift.some((d) => /PETG price/.test(d.label)));
});

test('repricing makes a new revision rather than editing the old one', () => {
  const { quote, result, order, settings } = pricedQuote();
  const next = reprice(quote, { result, order, settings });
  assert.equal(next.revision, 2);
  assert.equal(next.supersedes, quote.id);
  assert.notEqual(next.id, quote.id);
  assert.equal(quote.revision, 1, 'the original is untouched');
});

test('agreeTotal forces a document to the agreed figure and keeps it summing', () => {
  const { quote } = pricedQuote();
  const target = quote.total + 100;
  const agreed = agreeTotal(quote, target);
  close(agreed.total, target, 1e-9, 'total is the agreed figure the client paid');
  const line = agreed.extras[agreed.extras.length - 1];
  close(line.amount, 100, 0.01, 'the difference is one reconciling line');
  close(agreed.net, quote.net + line.amount, 1e-9, 'the net includes it');
  close(agreed.internal.profit, quote.internal.profit + line.amount, 1e-9,
    'the surplus over the priced total is extra margin');
});

test('an invoice made from a quote keeps the quote’s numbers', () => {
  const { quote } = pricedQuote();
  const invoice = invoiceFromQuote(quote, { number: 'INV2026-0001', dueDays: 14 });
  assert.equal(invoice.kind, 'invoice');
  assert.equal(invoice.quoteNumber, 'Q2026-0001');
  close(invoice.total, quote.total, 1e-9, 'total carried across');
  assert.equal(outstanding(invoice), invoice.total);
});

test('payments move an invoice through partial to paid', () => {
  const { quote } = pricedQuote();
  let invoice = invoiceFromQuote(quote, { number: 'INV2026-0001' });
  invoice = recordPayment(invoice, invoice.total / 2);
  assert.equal(invoice.status, 'partial');
  close(outstanding(invoice), invoice.total / 2, 1e-6, 'half outstanding');

  invoice = recordPayment(invoice, invoice.total / 2);
  assert.equal(invoice.status, 'paid');
  close(outstanding(invoice), 0, 1e-6, 'nothing outstanding');
});

test('overdue is computed from the due date, never stored', () => {
  const { quote } = pricedQuote();
  const invoice = invoiceFromQuote(quote, { number: 'INV2026-0001', dueDays: 14 });
  const later = new Date(new Date(invoice.dueAt).getTime() + 86400000);

  assert.equal(isOverdue(invoice), false);
  assert.equal(isOverdue(invoice, later), true);
  assert.equal(displayStatus(invoice, later).id, 'overdue');

  const settled = recordPayment(invoice, invoice.total);
  assert.equal(isOverdue(settled, later), false, 'a paid invoice is never overdue');
});

test('an expired quote shows as expired without being rewritten', () => {
  const { quote } = pricedQuote();
  const sent = { ...quote, status: 'sent' };
  const later = new Date(new Date(sent.expiresAt).getTime() + 86400000);
  assert.equal(displayStatus(sent, later).id, 'expired');
  assert.equal(sent.status, 'sent', 'the stored status is untouched');
});

test('the printed rows drop zero lines and keep the discount negative', () => {
  const { quote } = pricedQuote();
  const withDiscount = { ...quote, discount: 25, handling: 0, storage: 0 };
  const { rows, extras } = documentRows(withDiscount);
  assert.equal(rows.length, 1);
  assert.ok(extras.some((e) => e.label === 'Discount' && e.amount === -25));
  assert.ok(!extras.some((e) => e.label === 'Handling'), 'a zero line is not printed');
});

test('the assumption snapshot carries what moved a number and nothing else', () => {
  const settings = defaultSettings();
  const snapshot = snapshotAssumptions(settings);
  for (const key of ['thirds', 'ctc', 'scrap', 'demand', 'tax', 'freeShipping', 'materialPrices']) {
    assert.ok(snapshot[key] != null, `the snapshot is missing ${key}`);
  }
  assert.equal(snapshot.ui, undefined, 'UI state has no business in a quote');
  assert.equal(snapshot.customerPortal, undefined);
});

/* ------------------------------------------------------------ inventory -- */

test('stock is folded from movements, not stored as a number', () => {
  const spool = makeSpool({ materialId: 'pla-dark-grey', startingG: 1000 });
  const movements = [
    makeMovement({ itemId: spool.id, reason: 'production', quantity: -120 }),
    makeMovement({ itemId: spool.id, reason: 'production', quantity: -80 }),
    makeMovement({ itemId: spool.id, reason: 'return', quantity: 15 }),
  ];
  const balance = balanceOf([spool], movements, spool.id);
  close(balance.quantity, 815, 1e-9, 'balance');
  assert.equal(balance.movements, 3);
});

test('low stock is anything at or below its reorder point', () => {
  const a = makeStockItem({ kind: 'hardware', refId: 'magnet-6x3', reorderAt: 50 });
  const b = makeStockItem({ kind: 'hardware', refId: 'nut-m3', reorderAt: 20 });
  const movements = [
    makeMovement({ itemId: a.id, reason: 'purchase', quantity: 40 }),
    makeMovement({ itemId: b.id, reason: 'purchase', quantity: 200 }),
  ];
  const low = lowStock([a, b], movements);
  assert.equal(low.length, 1);
  assert.equal(low[0].item.id, a.id);
});

test('a production run books out material and hardware, a quote books out nothing', () => {
  const settings = defaultSettings();
  const part = samplePart({ hardware: [{ hardwareId: 'magnet-6x3', qty: 2 }] });
  const project = addPart(makeProject(), part);

  const movements = movementsForRun({
    project,
    part,
    attempt: { quantity: 4, grams: 160, failed: false },
    settings,
  });
  assert.equal(movements.length, 2);
  close(movements[0].quantity, -160, 1e-9, 'filament out');
  close(movements[1].quantity, -8, 1e-9, 'eight magnets for four parts');
  assert.ok(movements.every((m) => m.quantity < 0), 'production only removes stock');
});

test('a failed print still consumes stock, booked as scrap', () => {
  const settings = defaultSettings();
  const part = samplePart();
  const movements = movementsForRun({
    project: null, part, attempt: { quantity: 1, grams: 55, failed: true }, settings,
  });
  assert.equal(movements[0].reason, 'scrap');
  close(movements[0].quantity, -55, 1e-9, 'the plastic is gone either way');
});

test('packaging leaves stock at despatch, not at print', () => {
  const settings = defaultSettings();
  const packaging = { lines: [{ id: 'box-small', qty: 1 }, { id: 'tape', qty: 1 }] };
  const movements = movementsForDespatch({ project: { id: 'p', name: 'Job' }, packaging, settings });
  assert.equal(movements.length, 2);
  assert.ok(movements.every((m) => m.quantity === -1));
});

test('stock value uses the current catalogue price', () => {
  const settings = defaultSettings();
  const spool = makeSpool({ materialId: 'pla-dark-grey', startingG: 1000 });
  const value = stockValue([spool], [], settings);
  close(value.total, 350, 1e-9, 'a full R350 spool is worth R350');
});

test('spool picking finishes the part-used spool first', () => {
  const full = makeSpool({ materialId: 'pla-dark-grey', startingG: 1000 });
  const part = makeSpool({ materialId: 'pla-dark-grey', startingG: 1000 });
  const movements = [makeMovement({ itemId: part.id, reason: 'production', quantity: -700 })];
  const list = spoolsFor([full, part], movements, 'pla-dark-grey');
  assert.equal(list[0].item.id, part.id, 'the 300 g spool comes first');
});

test('every movement reason has a name, and an unknown one is not silent', () => {
  for (const r of MOVEMENT_REASONS) assert.ok(r.name && Number.isInteger(r.sign));
  assert.equal(reason('nonsense').id, 'adjustment');
});

/* ---------------------------------------------------------- calibration -- */

const runsProject = (n, { ratio = 1.2, failEvery = 0 } = {}) => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  for (let i = 0; i < n; i += 1) {
    project = recordAttempt(project, id, {
      quantity: 1,
      accepted: 1,
      rejected: 0,
      failed: failEvery > 0 && i % failEvery === 0,
      minutes: 100 * ratio,
      grams: 50 * ratio,
      estimatedMinutes: 100,
      estimatedGrams: 50,
      printerId: 'bambu-x1e',
    });
  }
  return project;
};

test('a correction is not offered until there is enough evidence', () => {
  const thin = calibrate(samplesFrom([runsProject(3)]), DEFAULT_CALIBRATION);
  assert.equal(thin[0].applied, false);
  assert.equal(thin[0].timeCorrection, 1, 'and it must be a no-op, not a guess');
  assert.match(thin[0].reason, /5 are needed/);

  const thick = calibrate(samplesFrom([runsProject(8)]), DEFAULT_CALIBRATION);
  assert.equal(thick[0].applied, true);
  close(thick[0].timeCorrection, 1.2, 1e-9, 'the learned time correction');
  close(thick[0].materialCorrection, 1.2, 1e-9, 'the learned material correction');
});

test('a failed print moves the failure rate and not the time correction', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  for (let i = 0; i < 6; i += 1) {
    project = recordAttempt(project, id, {
      quantity: 1, accepted: 1, minutes: 100, grams: 50,
      estimatedMinutes: 100, estimatedGrams: 50, printerId: 'bambu-x1e',
    });
  }
  // One catastrophic run: nine hours of spaghetti.
  project = recordAttempt(project, id, {
    quantity: 1, accepted: 0, rejected: 1, failed: true, minutes: 540, grams: 300,
    estimatedMinutes: 100, estimatedGrams: 50, printerId: 'bambu-x1e',
  });

  const [group] = calibrate(samplesFrom([project]), DEFAULT_CALIBRATION);
  close(group.timeCorrection, 1, 1e-9,
    'a failed print must not drag the estimator for every future part');
  assert.ok(group.failureRate > 0, 'but it must show up as a failure');
});

test('the correction is a median, so one outlier cannot move it', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  for (let i = 0; i < 7; i += 1) {
    project = recordAttempt(project, id, {
      quantity: 1, accepted: 1, minutes: 100, grams: 50,
      estimatedMinutes: 100, estimatedGrams: 50, printerId: 'bambu-x1e',
    });
  }
  project = recordAttempt(project, id, {
    quantity: 1, accepted: 1, minutes: 5000, grams: 50,
    estimatedMinutes: 100, estimatedGrams: 50, printerId: 'bambu-x1e',
  });
  const [group] = calibrate(samplesFrom([project]), DEFAULT_CALIBRATION);
  close(group.timeCorrection, 1, 1e-9, 'the median holds');
  assert.ok(group.timeSpread.max > 40, 'and the spread reports the outlier');
});

test('a correction outside the sane band is clamped, not applied', () => {
  let project = addPart(makeProject(), samplePart());
  const id = project.parts[0].id;
  for (let i = 0; i < 6; i += 1) {
    project = recordAttempt(project, id, {
      quantity: 1, accepted: 1, minutes: 100000, grams: 50,
      estimatedMinutes: 1, estimatedGrams: 50, printerId: 'bambu-x1e',
    });
  }
  const [group] = calibrate(samplesFrom([project]), DEFAULT_CALIBRATION);
  assert.equal(group.timeCorrection, 4, 'clamped at the configured ceiling');
  assert.ok(group.rawTimeCorrection > 4, 'and the raw value is still reported');
});

test('correctionFor falls back up the scope ladder by name', () => {
  const corrections = [
    { key: 'global', applied: true, timeCorrection: 1.1, materialCorrection: 1 },
    { key: 'function', applied: true, timeCorrection: 1.3, materialCorrection: 1 },
    { key: 'function|ender-3', applied: true, timeCorrection: 1.9, materialCorrection: 1 },
  ];
  assert.equal(correctionFor(corrections, { profileId: 'function', printerId: 'ender-3' }).timeCorrection, 1.9);
  assert.equal(correctionFor(corrections, { profileId: 'function', printerId: 'bambu-x1e' }).timeCorrection, 1.3);
  assert.equal(correctionFor(corrections, { profileId: 'visual', printerId: 'x' }).timeCorrection, 1.1);
  assert.equal(correctionFor([], { profileId: 'function' }), null);
});

test('the error report gives signed percentages, not multipliers', () => {
  const report = errorReport(samplesFrom([runsProject(6, { ratio: 1.25 })]));
  close(report.appTime.median, 0.25, 1e-9, 'the app ran 25% over');
  assert.equal(report.appTime.n, 6);
  assert.equal(report.slicerTime, null, 'no slicer data, so no slicer claim');
});

/* ------------------------------------------------------------ analytics -- */

test('the dashboard reports null rather than a confident zero on no data', () => {
  const d = dashboard({ projects: [], settings: defaultSettings() });
  assert.equal(d.production.rejectionRate, null);
  assert.equal(d.money.margin, null);
  assert.equal(d.conversion, null);
  assert.equal(d.counts.projects, 0);
});

test('the dashboard adds up revenue, cost and profit from real invoices', () => {
  const { quote, project } = pricedQuote();
  const invoice = recordPayment(invoiceFromQuote(quote, { number: 'INV1' }), quote.total);
  const withDocs = { ...project, invoices: [invoice], quotes: [{ ...quote, status: 'accepted' }] };

  const d = dashboard({ projects: [withDocs], settings: defaultSettings() });
  close(d.money.revenue, quote.total, 1e-9, 'revenue');
  close(d.money.paid, quote.total, 1e-9, 'paid');
  close(d.money.costToCompany, quote.internal.costToCompany, 1e-9, 'CTC');
  close(d.money.profit, quote.total - quote.internal.costToCompany, 1e-9, 'profit');
  assert.equal(d.conversion, 1);
});

test('committed load counts accepted work only, never open quotes', () => {
  const settings = defaultSettings();
  const quoted = setStatus(addPart(makeProject(), samplePart()), 'quoted');
  const accepted = setStatus(addPart(makeProject(), samplePart()), 'accepted');

  assert.equal(committedLoad([quoted], settings).jobs, 0,
    'a quote nobody agreed to is not capacity');
  assert.equal(committedLoad([accepted], settings).jobs, 1);
});

test('revenue by month covers the requested window and no more', () => {
  const buckets = revenueByMonth([], 6, new Date('2026-06-15T00:00:00Z'));
  assert.equal(buckets.length, 6);
  assert.equal(buckets[buckets.length - 1].key, '2026-06');
  assert.equal(buckets[0].key, '2026-01');
});

test('an invoiced project is locked to the invoice price, whatever settings do later', () => {
  const { quote, result } = pricedQuote();
  const invoice = invoiceFromQuote(quote, { number: 'INV1' });
  const locked = lockedPricing([invoice]);
  close(locked.finalInvoice, result.totals.finalInvoice, 1e-9, 'locked to the invoice total');
  close(locked.costToCompany, quote.internal.costToCompany, 1e-9, 'and its frozen cost');
  close(locked.partPrice, quote.internal.costToCompany + quote.internal.profit, 1e-9);
  assert.equal(locked.number, 'INV1');
});

test('a project with no invoice has no locked price and is still priced live', () => {
  assert.equal(lockedPricing([]), null);
  assert.equal(lockedPricing(null), null);
});

test('the most recent invoice is the one a project is locked to', () => {
  const { quote } = pricedQuote();
  const a = invoiceFromQuote(quote, { number: 'INV1' });
  const b = invoiceFromQuote(quote, { number: 'INV2' });
  assert.equal(lockedPricing([a, b]).number, 'INV2');
});
