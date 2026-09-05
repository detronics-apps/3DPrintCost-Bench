/**
 * Restoring a whole workshop from a backup file.
 *
 * This is what lets a newer version of the app open a workshop an older version
 * saved, without losing anything. The properties that matter: the full setup and
 * every project - with its quotes and INVOICES - come back; an older-shaped
 * backup is upgraded through the migrations on the way in; and a file that is not
 * a full backup is refused rather than silently wiping the workshop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, restoreFromFile, exportAll } from '../js/state.js';

const backup = () => JSON.stringify({
  app: '3D Printing Bench',
  version: 1,
  settings: {
    version: 1,
    company: { name: 'Acme Works' },
    // An older backup that predates the printer payback field entirely.
    printers: [{ id: 'bambu-x1e', name: 'Bambu Lab X1E', purchasePrice: 46000 }],
  },
  projects: [{
    id: 'p1', name: 'Bracket', parts: [],
    quotes: [{ id: 'q1', number: 'Q2026-0001' }],
    invoices: [{ id: 'inv1', number: 'INV2026-0001' }, { id: 'inv2', number: 'INV2026-0002' }],
  }],
  customers: [{ id: 'c1', name: 'Bob' }],
  inventory: { items: [], movements: [] },
});

test('a full backup comes back, invoices and quotes and all', () => {
  const report = restoreFromFile(backup());
  assert.equal(report.ok, true);
  assert.equal(report.projects, 1);
  assert.equal(report.quotes, 1);
  assert.equal(report.invoices, 2);

  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].invoices.length, 2, 'both invoices survive the restore');
  assert.equal(state.projects[0].quotes.length, 1, 'the quote survives too');
  assert.equal(state.customers[0].name, 'Bob');
  assert.equal(state.settings.company.name, 'Acme Works');
});

test('an older-shaped backup is upgraded through the migrations', () => {
  restoreFromFile(backup());
  const bambu = state.settings.printers.find((p) => p.id === 'bambu-x1e');
  // The payback field did not exist when this backup was written; loading it must
  // fill in the new default rather than leave it missing.
  assert.ok('paybackHoursOverride' in bambu, 'the new field is filled in on restore');
});

test('a file that is not a full backup is refused, not applied', () => {
  const before = state.projects.length;
  const r1 = restoreFromFile('not json at all');
  assert.equal(r1.ok, false);
  const r2 = restoreFromFile(JSON.stringify({ kind: 'project', project: { id: 'x' } }));
  assert.equal(r2.ok, false, 'a single-project file has no settings, so it is not a full backup');
  assert.equal(state.projects.length, before, 'the workshop is untouched by a refused restore');
});

test('a customer request is refused by Open even though it carries settings', () => {
  restoreFromFile(backup());
  const before = state.projects.length;
  // A portal request carries the pricing settings, so it would otherwise look
  // like a full backup and replace the whole workshop with one project.
  const request = JSON.stringify({
    kind: 'project',
    project: { id: 'req1', name: 'From a customer', parts: [] },
    customer: { id: 'cx', name: 'Nadia' },
    settings: { version: 1, company: { name: 'Should not win' } },
  });
  const r = restoreFromFile(request);
  assert.equal(r.ok, false, 'Open refuses a single project');
  assert.match(r.error, /Upload project/, 'and points at the right button');
  assert.equal(state.projects.length, before, 'nothing is replaced');
  assert.equal(state.settings.company.name, 'Acme Works', 'the open company is untouched');
});

test('exportAll then restoreFromFile is a faithful round-trip', () => {
  restoreFromFile(backup());
  const dumped = exportAll();
  const report = restoreFromFile(dumped);
  assert.equal(report.ok, true);
  assert.equal(report.invoices, 2, 'a re-exported backup still carries the invoices');
  assert.equal(state.settings.company.name, 'Acme Works');
});
