/**
 * CSV onboarding: parsing, and the four separate importers for data that existed
 * before the app — clients, hardware on hand, filament on hand, and a printer's
 * prior print history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, field, toCsv } from '../js/csv.js';
import {
  importClients, importHardwareStock, importFilamentStock, importPrintRuns, printRunTemplate,
} from '../js/imports.js';
import { makeCustomer } from '../js/projects.js';

/* --------------------------------------------------------------- csv ------ */

test('parseCsv reads headers, trims, and handles quoted commas and quotes', () => {
  const { headers, rows } = parseCsv('Name,Note\r\n"Acme, Ltd","say ""hi"""\nBob,plain\n');
  assert.deepEqual(headers, ['Name', 'Note']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, 'Acme, Ltd');
  assert.equal(rows[0].Note, 'say "hi"');
  assert.equal(rows[1].Name, 'Bob');
});

test('field reads by any alias, case-insensitively, and blank when absent', () => {
  const row = { Email: 'a@b.com', 'Phone ': '' };
  assert.equal(field(row, 'e-mail', 'email'), 'a@b.com');
  assert.equal(field(row, 'mobile', 'phone'), '');
});

test('toCsv round-trips through parseCsv', () => {
  const text = toCsv(['A', 'B'], [{ A: 'x,y', B: '1' }]);
  const { rows } = parseCsv(text);
  assert.equal(rows[0].A, 'x,y');
  assert.equal(rows[0].B, '1');
});

/* ------------------------------------------------------------ clients ----- */

test('clients import adds new and skips ones already held by email or phone', () => {
  const existing = [makeCustomer({ name: 'Acme', email: 'buyer@acme.com' })];
  const { rows } = parseCsv(
    'First name,Surname,Email,Phone\n'
    + 'Sam,Ndlovu,sam@x.com,082 123 4567\n'
    + 'Acme,Buyer,BUYER@acme.com,\n', // same email as existing → matched
  );
  const res = importClients(rows, existing);
  assert.equal(res.added.length, 1, 'only the new one is added');
  assert.equal(res.added[0].name, 'Sam Ndlovu');
  assert.equal(res.added[0].firstName, 'Sam');
  assert.equal(res.matched, 1, 'the existing customer is matched, not duplicated');
});

test('two rows for the same new person only add them once', () => {
  const { rows } = parseCsv('Name,Email\nA,dup@x.com\nB,dup@x.com\n');
  const res = importClients(rows, []);
  assert.equal(res.added.length, 1);
  assert.equal(res.matched, 1);
});

/* ------------------------------------------------------- hardware stock --- */

test('hardware import matches the catalogue and books an opening movement', () => {
  const catalogue = [{ id: 'insert-m3', name: 'M3 heat-set insert' }];
  const { rows } = parseCsv('Hardware,Quantity\nM3 heat-set insert,50\nunknown thing,3\n');
  const res = importHardwareStock(rows, catalogue, []);
  assert.equal(res.items.length, 1, 'one new stock item');
  assert.equal(res.items[0].refId, 'insert-m3');
  assert.equal(res.movements.length, 1);
  assert.equal(res.movements[0].quantity, 50);
  assert.equal(res.movements[0].reason, 'purchase');
  assert.equal(res.errors.length, 1, 'the unknown row is reported, not guessed');
  assert.match(res.errors[0].msg, /unknown hardware/);
});

test('a second hardware row for an item already stocked reuses its item', () => {
  const catalogue = [{ id: 'nut-m3', name: 'M3 hex nut' }];
  const existing = [{ id: 'stock1', kind: 'hardware', refId: 'nut-m3' }];
  const { rows } = parseCsv('Hardware,Quantity\nnut-m3,100\n');
  const res = importHardwareStock(rows, catalogue, existing);
  assert.equal(res.items.length, 0, 'no new item — the existing one is used');
  assert.equal(res.movements[0].itemId, 'stock1');
});

/* ------------------------------------------------------- filament stock --- */

test('filament import makes a spool per row, matched by id, name or "colour name"', () => {
  const materials = [{ id: 'petg-dark-grey', name: 'PETG', colour: 'Dark Grey' }];
  const { rows } = parseCsv('Material,Grams,Location\nDark Grey PETG,750,Shelf A\npetg-dark-grey,300,\n');
  const res = importFilamentStock(rows, materials);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].materialId, 'petg-dark-grey');
  assert.equal(res.items[0].startingG, 750);
  assert.equal(res.items[0].location, 'Shelf A');
  assert.equal(res.items[1].startingG, 300);
});

/* --------------------------------------------------------- print runs ----- */

test('print history import records prior runs, accepting minutes or hours', () => {
  const printers = [{ id: 'bambu-x1e', name: 'Bambu Lab X1E' }];
  const { rows } = parseCsv('Printer,Minutes,Grams,Date\n'
    + 'Bambu Lab X1E,620,180,2026-01-15\n'
    + 'bambu-x1e,,90,\n'
    + 'Ghost Printer,10,,\n');
  const res = importPrintRuns(rows, printers);
  assert.equal(res.runs.length, 2);
  assert.equal(res.runs[0].printerId, 'bambu-x1e');
  assert.equal(res.runs[0].minutes, 620);
  assert.equal(res.runs[0].grams, 180);
  assert.ok(res.runs[0].at, 'the date is parsed to an ISO timestamp');
  assert.equal(res.errors.length, 1, 'the unknown printer is reported');
});

test('print history accepts hours when minutes are absent', () => {
  const printers = [{ id: 'p1', name: 'P1' }];
  const { rows } = parseCsv('Printer,Hours,Grams\nP1,10,50\n');
  const res = importPrintRuns(rows, printers);
  assert.equal(res.runs[0].minutes, 600, '10 hours becomes 600 minutes');
});

test('multi-head history sums the heads into the total and keeps per-head detail', () => {
  const printers = [{ id: 'snapmaker-u1', name: 'Snapmaker U1', colourSlots: 4 }];
  const materials = [
    { id: 'petg-dark-grey', name: 'PETG', colour: 'Dark Grey' },
    { id: 'pla-white', name: 'PLA', colour: 'White' },
  ];
  const { rows } = parseCsv(
    'Printer,Minutes,Head 1 grams,Head 1 colour,Head 2 grams,Head 2 colour,'
    + 'Head 3 grams,Head 3 colour,Head 4 grams,Head 4 colour,Date\n'
    + 'Snapmaker U1,480,120,Dark Grey PETG,45,White PLA,0,,0,,2026-02-01\n',
  );
  const res = importPrintRuns(rows, printers, materials);
  assert.equal(res.runs.length, 1);
  const run = res.runs[0];
  assert.equal(run.grams, 165, '120 + 45 across the used heads');
  assert.equal(run.minutes, 480);
  assert.equal(run.heads.length, 2, 'only the heads that ran are kept');
  assert.equal(run.heads[0].materialId, 'petg-dark-grey', 'colour matched to a material');
  assert.equal(run.heads[0].colour, 'Dark Grey PETG');
  assert.equal(run.heads[1].materialId, 'pla-white');
});

test('a single Grams column still imports (no heads), unchanged', () => {
  const printers = [{ id: 'ender-3', name: 'Creality Ender-3', colourSlots: 1 }];
  const { rows } = parseCsv('Printer,Minutes,Grams,Date\nCreality Ender-3,300,90,2026-01-10\n');
  const res = importPrintRuns(rows, printers, []);
  assert.equal(res.runs[0].grams, 90);
  assert.equal(res.runs[0].heads, undefined, 'no per-head detail on a single-colour run');
});

test('an unknown head colour is kept as a label, not dropped', () => {
  const printers = [{ id: 'p1', name: 'P1', colourSlots: 2 }];
  const { rows } = parseCsv('Printer,Minutes,Head 1 grams,Head 1 colour\nP1,60,30,Glow Green\n');
  const res = importPrintRuns(rows, printers, []);
  assert.equal(res.runs[0].grams, 30);
  assert.equal(res.runs[0].heads[0].colour, 'Glow Green');
  assert.equal(res.runs[0].heads[0].materialId, null);
});

test('printRunTemplate is single-column for a single-colour printer, per-head for many', () => {
  const single = printRunTemplate({ name: 'Creality Ender-3', colourSlots: 1 });
  assert.deepEqual(single.headers, ['Printer', 'Minutes', 'Grams', 'Date']);
  assert.equal(single.sample.Printer, 'Creality Ender-3');

  const multi = printRunTemplate({ name: 'Snapmaker U1', colourSlots: 4 });
  assert.ok(multi.headers.includes('Head 1 grams') && multi.headers.includes('Head 4 colour'));
  assert.ok(!multi.headers.includes('Head 5 grams'), 'only as many heads as the printer loads');
  assert.equal(multi.headers[0], 'Printer');
  assert.equal(multi.headers.at(-1), 'Date');
  assert.equal(multi.sample.Printer, 'Snapmaker U1');
});
