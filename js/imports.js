/**
 * Bringing in what existed before the app. Pure.
 *
 * A workshop does not start the day it adopts the tool: it already has clients,
 * stock on the shelf, and a printer that has already run for hours. Each of these
 * is its OWN import, unconnected to the others — you can load your client list
 * without touching stock, and log a printer's past hours without inventing a
 * project. Every importer is additive and reports what it added, matched and
 * could not read (by line number), so importing a file twice is safe to check.
 *
 * These functions only decide WHAT to add; the caller applies the result to
 * state. Nothing here reads a file or mutates anything.
 */

import { field } from './csv.js';
import { num } from './money.js';
import { makeCustomer, matchCustomer } from './projects.js';
import { makeSpool, makeStockItem, makeMovement } from './inventory.js';

const lc = (v) => String(v ?? '').trim().toLowerCase();

/** Match a catalogue entry by id or name, case-insensitively. */
function findByIdOrName(list, value) {
  const v = lc(value);
  if (!v) return null;
  return (list || []).find((x) => lc(x.id) === v)
    || (list || []).find((x) => lc(x.name) === v)
    || null;
}

/** Materials also match on their "Colour Name" label, which is how people write them. */
function findMaterial(materials, value) {
  const v = lc(value);
  if (!v) return null;
  return (materials || []).find((m) => lc(m.id) === v)
    || (materials || []).find((m) => lc(`${m.colour} ${m.name}`) === v)
    || (materials || []).find((m) => lc(m.name) === v)
    || null;
}

const isoDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * Existing clients → customer records. Matched to what is already held by email
 * or phone (so re-importing does not duplicate); a genuinely new client is added.
 */
export function importClients(rows, existingCustomers = []) {
  const added = [];
  const errors = [];
  let matched = 0;
  const pool = [...existingCustomers];

  (rows || []).forEach((row, i) => {
    const line = i + 2;
    const firstName = field(row, 'first name', 'firstname', 'first');
    const surname = field(row, 'surname', 'last name', 'lastname', 'last');
    const nameCol = field(row, 'name', 'client', 'customer', 'company');
    const email = field(row, 'email', 'e-mail');
    const phone = field(row, 'phone', 'mobile', 'cell', 'tel');
    const name = `${firstName} ${surname}`.trim() || nameCol;

    if (!name && !email && !phone) {
      errors.push({ line, msg: 'row has no name, email or phone' });
      return;
    }
    if (matchCustomer(pool, { email, phone })) { matched += 1; return; }

    const cust = makeCustomer({
      name: name || 'Imported customer',
      firstName,
      surname,
      email,
      phone,
      vatNumber: field(row, 'vat', 'vat number', 'vatnumber'),
      address: field(row, 'address'),
      notes: field(row, 'notes', 'note'),
    });
    added.push(cust);
    pool.push(cust);
  });

  return { added, matched, errors };
}

/**
 * Hardware on the shelf → a stock item per catalogue component (reused if it
 * already exists) and a dated opening "purchased" movement for the count on hand.
 */
export function importHardwareStock(rows, hardwareCatalogue = [], existingItems = []) {
  const items = [];
  const movements = [];
  const errors = [];
  let matched = 0;
  const pool = [...existingItems];

  (rows || []).forEach((row, i) => {
    const line = i + 2;
    const ref = field(row, 'hardware', 'component', 'item', 'name', 'id');
    const qty = Math.max(0, Math.round(num(field(row, 'quantity', 'qty', 'count', 'on hand', 'onhand'))));
    const spec = findByIdOrName(hardwareCatalogue, ref);
    if (!spec) { errors.push({ line, msg: `unknown hardware "${ref}"` }); return; }
    if (qty <= 0) { errors.push({ line, msg: 'quantity must be a positive number' }); return; }

    let item = pool.find((it) => it.kind === 'hardware' && it.refId === spec.id && !it.archived);
    if (!item) {
      item = makeStockItem({ kind: 'hardware', refId: spec.id });
      items.push(item);
      pool.push(item);
    }
    movements.push(makeMovement({
      itemId: item.id, reason: 'purchase', quantity: qty,
      note: `Opening balance (CSV import): ${spec.name}`,
    }));
    matched += 1;
  });

  return { items, movements, matched, errors };
}

/**
 * Rolls of filament on the shelf → a spool per row, its remaining grams the
 * opening balance. Spools are always added (two half-rolls of the same colour
 * are two spools), so there is no dedup here.
 */
export function importFilamentStock(rows, materials = []) {
  const items = [];
  const errors = [];
  let added = 0;

  (rows || []).forEach((row, i) => {
    const line = i + 2;
    const ref = field(row, 'material', 'filament', 'spool', 'name', 'id');
    const grams = Math.max(0, Math.round(num(field(row, 'grams', 'g', 'weight', 'remaining', 'on hand'))));
    const mat = findMaterial(materials, ref);
    if (!mat) { errors.push({ line, msg: `unknown material "${ref}"` }); return; }
    if (grams <= 0) { errors.push({ line, msg: 'grams must be a positive number' }); return; }

    items.push(makeSpool({
      materialId: mat.id,
      startingG: grams,
      batch: field(row, 'batch'),
      location: field(row, 'location'),
    }));
    added += 1;
  });

  return { items, added, errors };
}

/**
 * A printer's existing print history → prior run records {printerId, minutes,
 * grams, at}. These are NOT projects and touch no customer; they exist only so
 * the machine's hours (and how far into its life it is) count what it did before
 * the app. A row gives a printer and either a print time or grams used.
 */
export function importPrintRuns(rows, printers = []) {
  const runs = [];
  const errors = [];
  let added = 0;

  (rows || []).forEach((row, i) => {
    const line = i + 2;
    const ref = field(row, 'printer', 'machine', 'name', 'id');
    const printer = findByIdOrName(printers, ref);
    if (!printer) { errors.push({ line, msg: `unknown printer "${ref}"` }); return; }

    const minutes = num(field(row, 'minutes', 'print time', 'mins', 'time'));
    const hours = num(field(row, 'hours', 'print time hours', 'hrs'));
    const mins = minutes > 0 ? minutes : hours * 60;
    const grams = Math.max(0, num(field(row, 'grams', 'g', 'material', 'filament')));
    if (mins <= 0 && grams <= 0) { errors.push({ line, msg: 'row has no print time or grams' }); return; }

    runs.push({
      printerId: printer.id,
      minutes: Math.max(0, mins),
      grams,
      at: isoDate(field(row, 'date', 'completed', 'when')),
    });
    added += 1;
  });

  return { runs, added, errors };
}

/** The header rows for the downloadable sample templates, one per import. */
export const SAMPLE_TEMPLATES = {
  clients: {
    headers: ['First name', 'Surname', 'Email', 'Phone', 'VAT number', 'Address', 'Notes'],
    sample: { 'First name': 'Sam', Surname: 'Ndlovu', Email: 'sam@example.com', Phone: '082 123 4567', 'VAT number': '', Address: '', Notes: '' },
  },
  hardware: {
    headers: ['Hardware', 'Quantity'],
    sample: { Hardware: 'M3 heat-set insert', Quantity: '50' },
  },
  filament: {
    headers: ['Material', 'Grams', 'Batch', 'Location'],
    sample: { Material: 'Dark Grey PETG', Grams: '750', Batch: '', Location: 'Shelf A' },
  },
  prints: {
    headers: ['Printer', 'Minutes', 'Grams', 'Date'],
    sample: { Printer: 'Bambu Lab X1E', Minutes: '620', Grams: '180', Date: '2026-01-15' },
  },
};
