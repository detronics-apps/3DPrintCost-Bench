/**
 * Inventory: spools, hardware and packaging.
 *
 * Stock is folded from the movement log rather than stored, so every balance
 * can say where it came from and no failed write can leave a number that is
 * quietly wrong.
 */

import { el, toast } from '../dom.js';
import {
  section, subsection, numberField, textField, selectField, button, buttonRow,
  table, muted, statTile, pill, banner, emptyState, chips,
} from '../controls.js';
import { fmtMoney, num } from '../../money.js';
import {
  makeSpool, makeStockItem, makeMovement, balances, lowStock, stockValue,
  MOVEMENT_REASONS, reason,
} from '../../inventory.js';
import { findMaterial } from '../../materials.js';
import { findHardware, findPackaging } from '../../packaging.js';
import { buildSpoolLabels, printSheet } from '../export.js';
import { state, saveSoon } from '../../state.js';

export const id = 'inventory';
export const name = 'Inventory';
export const short = 'Stock';

const touch = (rerender) => { saveSoon(); rerender(); };

function nameOf(item) {
  const settings = state.settings;
  if (item.kind === 'filament') {
    const material = findMaterial(settings.materials, item.materialId);
    return `${material.name} · ${material.colour}${item.batch ? ` · batch ${item.batch}` : ''}`;
  }
  if (item.kind === 'hardware') return findHardware(settings.hardware, item.refId)?.name || item.refId || 'Hardware';
  return findPackaging(settings.packaging, item.refId)?.name || item.refId || 'Packaging';
}

// Filament is grams; hardware and packaging are a plain count, so they carry no
// unit suffix (the old “off” read as a typo to everyone who is not in the trade).
function unitOf(item) {
  return item.kind === 'filament' ? 'g' : '';
}

/** A quantity with its unit, and no trailing space when there is no unit. */
function qtyWithUnit(qty, item, decimals = 0) {
  const u = unitOf(item);
  return `${num(qty).toFixed(decimals)}${u ? ` ${u}` : ''}`;
}

/** The hardware component's logistics part number, for the stock table. */
function partNumberOf(item) {
  if (item.kind !== 'hardware') return '';
  return findHardware(state.settings.hardware, item.refId)?.partNumber || '';
}

export function main(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const items = state.inventory.items;
  const movements = state.inventory.movements;

  if (!items.length) {
    return [emptyState(
      'No stock tracked yet. Add the spools you actually have and the app will book '
      + 'material out as production is recorded.',
      button('Add a spool', () => addSpool(rerender), { primary: true, key: 'add-spool' }),
    )];
  }

  const rows = balances(items, movements)
    .filter((b) => !b.item.archived)
    .map((b) => ({ ...b, name: nameOf(b.item), unit: unitOf(b.item) }));

  const low = lowStock(items, movements);
  const value = stockValue(items, movements, settings);

  const recent = [...movements]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 25)
    .map((m) => ({
      movement: m,
      when: new Date(m.at).toLocaleDateString(),
      item: items.find((i) => i.id === m.itemId),
    }));

  return [
    el('div', { class: 'summary-grid' }, [
      statTile('Stock lines', String(rows.length)),
      statTile('Value on hand', fmtMoney(value.total, code), { tone: 'accent' }),
      statTile('Below reorder point', String(low.length), { tone: low.length ? 'warn' : null }),
      statTile('Filament on hand',
        `${(rows.filter((r) => r.item.kind === 'filament').reduce((t, r) => t + r.quantity, 0) / 1000).toFixed(2)} kg`),
    ]),

    ...low.map((b) => banner('warn',
      `${nameOf(b.item)} is down to ${qtyWithUnit(b.quantity, b.item)} `
      + `against a reorder point of ${num(b.item.reorderAt)}.`)),

    el('div', { class: 'panel' }, [
      el('div', { class: 'panel__head' }, [
        el('h3', { text: 'On hand' }),
        el('div', { class: 'btn-row' }, [
          button('Add a spool', () => addSpool(rerender), { key: 'add-spool' }),
          button('Add hardware', () => addStock('hardware', rerender), { key: 'add-hardware' }),
          button('Add packaging', () => addStock('packaging', rerender), { key: 'add-packaging' }),
          button('Print spool labels', () => printSpoolLabels(), { key: 'print-labels' }),
        ]),
      ]),
      table([
        { label: 'Item', key: 'name' },
        { label: 'Kind', get: (r) => r.item.kind },
        { label: 'Part no.', mono: true, get: (r) => partNumberOf(r.item) || '—' },
        { label: 'Location', get: (r) => r.item.location || '—' },
        {
          label: 'On hand',
          align: 'right',
          mono: true,
          get: (r) => qtyWithUnit(r.quantity, r.item),
        },
        { label: 'Reorder at', align: 'right', mono: true, get: (r) => qtyWithUnit(r.item.reorderAt, r.item) },
        { label: 'Movements', align: 'right', mono: true, get: (r) => String(r.movements) },
        {
          label: '',
          get: (r) => (r.quantity <= num(r.item.reorderAt) ? pill('reorder', 'warn') : ''),
        },
        {
          label: 'Adjust',
          get: (r) => button('Adjust', () => {
            state.ui.adjustItem = r.item.id;
            touch(ctx.rerender);
          }, { key: `adjust-${r.item.id}` }),
        },
      ], rows),
    ]),

    recent.length ? el('div', { class: 'panel' }, [
      el('h3', { text: 'Recent movements' }),
      table([
        { label: 'When', key: 'when' },
        { label: 'Item', get: (r) => (r.item ? nameOf(r.item) : r.movement.itemId) },
        { label: 'Reason', get: (r) => reason(r.movement.reason).name },
        {
          label: 'Change',
          align: 'right',
          mono: true,
          get: (r) => `${num(r.movement.quantity) > 0 ? '+' : ''}${num(r.movement.quantity).toFixed(0)}`,
        },
        { label: 'Note', get: (r) => r.movement.note || '—' },
        {
          label: '',
          get: (r) => button('Delete', () => {
            if (!window.confirm('Delete this stock movement? The on-hand balance is '
              + 'recalculated without it.')) return;
            state.inventory.movements = state.inventory.movements
              .filter((m) => m.id !== r.movement.id);
            toast('Movement deleted');
            touch(ctx.rerender);
          }, { key: `del-mv-${r.movement.id}`, danger: true }),
        },
      ], recent, { compact: true }),
      muted('Deleting a movement recalculates the balance from what is left — use it for a '
        + 'mistaken entry. A production movement can be deleted too, but its print record stays.'),
    ]) : null,
  ];
}

function printSpoolLabels() {
  const spools = state.inventory.items.filter((i) => i.kind === 'filament' && !i.archived);
  if (!spools.length) { toast('No spools to label yet — add a spool first.'); return; }
  const host = document.getElementById('print-host');
  buildSpoolLabels(spools, { host, settings: state.settings });
  document.body.classList.add('printing');
  printSheet();
  setTimeout(() => document.body.classList.remove('printing'), 500);
}

function addSpool(rerender) {
  const spool = makeSpool({
    materialId: state.settings.materials[0]?.id,
    startingG: state.settings.materials[0]?.spoolWeight ?? 1000,
    reorderAt: 200,
  });
  state.inventory.items.push(spool);
  state.ui.adjustItem = spool.id;
  touch(rerender);
}

function addStock(kind, rerender) {
  const source = kind === 'hardware' ? state.settings.hardware : state.settings.packaging;
  const item = makeStockItem({ kind, refId: source[0]?.id, reorderAt: 10 });
  state.inventory.items.push(item);
  state.ui.adjustItem = item.id;
  touch(rerender);
}

export function sidebar(ctx) {
  const { rerender } = ctx;
  const items = state.inventory.items;
  const selected = items.find((i) => i.id === state.ui.adjustItem) || items[items.length - 1];
  if (!selected) return [];

  const settings = state.settings;
  const set = (key) => (value) => { selected[key] = value; touch(rerender); };
  const balance = balances(items, state.inventory.movements)
    .find((b) => b.item.id === selected.id);

  const adjustment = state.ui.adjustAmount ?? 0;

  return [
    selectField('stock-pick', 'Stock line',
      items.map((i) => ({ value: i.id, label: nameOf(i) })),
      selected.id, (v) => { state.ui.adjustItem = v; touch(rerender); }),

    section('stock-item', 'This line', [
      selected.kind === 'filament'
        ? selectField('stock-material', 'Material',
          settings.materials.map((m) => ({ value: m.id, label: `${m.name} · ${m.colour}` })),
          selected.materialId, set('materialId'))
        : selectField('stock-ref', 'Item',
          (selected.kind === 'hardware' ? settings.hardware : settings.packaging)
            .map((x) => ({ value: x.id, label: x.name })),
          selected.refId, set('refId')),
      selected.kind === 'filament'
        ? numberField('stock-starting', 'Spool as bought', selected.startingG,
          (v) => set('startingG')(Math.max(0, num(v))), { min: 0, suffix: 'g' })
        : null,
      textField('stock-batch', 'Batch', selected.batch || '', set('batch')),
      textField('stock-location', 'Location', selected.location, set('location')),
      numberField('stock-reorder', 'Reorder point', selected.reorderAt,
        (v) => set('reorderAt')(Math.max(0, num(v))), { min: 0, suffix: unitOf(selected) }),
      el('div', { class: 'summary-grid' }, [
        statTile('On hand', qtyWithUnit(balance?.quantity ?? 0, selected)),
      ]),
    ]),

    section('stock-move', 'Record a movement', [
      muted('Positive adds to stock, negative takes it out. Production movements are '
        + 'recorded automatically when a print is booked in.'),
      selectField('move-reason', 'Reason',
        MOVEMENT_REASONS.map((r) => ({ value: r.id, label: r.name })),
        state.ui.adjustReason || 'purchase',
        (v) => { state.ui.adjustReason = v; touch(rerender); }),
      numberField('move-amount', 'Change', adjustment,
        (v) => { state.ui.adjustAmount = num(v); touch(rerender); },
        { suffix: unitOf(selected) }),
      textField('move-note', 'Note', state.ui.adjustNote || '',
        (v) => { state.ui.adjustNote = v; saveSoon(); }),
      buttonRow([button('Record it', () => {
        const amount = num(state.ui.adjustAmount);
        if (!amount) { toast('Enter an amount first'); return; }
        state.inventory.movements.push(makeMovement({
          itemId: selected.id,
          reason: state.ui.adjustReason || 'purchase',
          quantity: amount,
          note: state.ui.adjustNote || '',
        }));
        state.ui.adjustAmount = 0;
        state.ui.adjustNote = '';
        toast('Movement recorded');
        touch(rerender);
      }, { primary: true, key: 'record-movement' })]),
    ]),

    buttonRow([
      button(selected.archived ? 'Restore' : 'Archive this line', () => {
        selected.archived = !selected.archived;
        touch(rerender);
      }, { key: 'archive-stock' }),
    ]),
  ];
}
