/**
 * Inventory. Pure.
 *
 * Stock is derived from transactions, never stored as a number. A stored
 * balance and a transaction log disagree the moment one write fails, and the
 * balance is the one that gets believed. So the log is the truth and the
 * balance is a fold over it - which also means every figure can say where it
 * came from.
 */

import { num } from './money.js';
import { makeId, nowIso } from './projects.js';
import { pricePerGram, findMaterial } from './materials.js';
import { itemPrice, findHardware, findPackaging } from './packaging.js';
import { topAreaCm2 } from './postprocessing.js';

export const STOCK_KINDS = [
  { id: 'filament', name: 'Filament', unit: 'g' },
  { id: 'resin', name: 'Resin', unit: 'g' },
  { id: 'hardware', name: 'Hardware', unit: 'off' },
  { id: 'packaging', name: 'Packaging', unit: 'off' },
];

/** Both filament and resin are stocked by weight, booked in as a full spool/bottle. */
const byWeight = (item) => item.kind === 'filament' || item.kind === 'resin';

export const MOVEMENT_REASONS = [
  { id: 'purchase', name: 'Purchased', sign: 1 },
  { id: 'production', name: 'Used in production', sign: -1 },
  { id: 'scrap', name: 'Scrapped', sign: -1 },
  { id: 'adjustment', name: 'Manual adjustment', sign: 0 },
  { id: 'return', name: 'Returned to stock', sign: 1 },
];

export function reason(id) {
  return MOVEMENT_REASONS.find((r) => r.id === id) || MOVEMENT_REASONS.find((r) => r.id === 'adjustment');
}

/** A spool is a stock item with a batch and a location, not just a material. */
export function makeSpool(spec = {}) {
  return {
    id: makeId('spool'),
    kind: 'filament',
    materialId: 'pla-dark-grey',
    batch: '',
    location: '',
    openedAt: null,
    purchasePrice: null,
    startingG: 1000,
    archived: false,
    ...spec,
  };
}

export function makeStockItem(spec = {}) {
  return {
    id: makeId('stock'),
    kind: 'hardware',
    refId: null,
    location: '',
    reorderAt: 0,
    archived: false,
    ...spec,
  };
}

/** A resin bottle, stocked by weight like a spool. */
export function makeResin(spec = {}) {
  return {
    id: makeId('resin'),
    kind: 'resin',
    batch: '',
    location: '',
    startingG: 1000,
    reorderAt: 200,
    archived: false,
    ...spec,
  };
}

/** The resin one resined part uses: its top area × the grams-per-cm² setting. */
export function resinGramsForPart(part, size, settings) {
  if (!part?.needsResin) return 0;
  const perCm2 = Math.max(0, num(settings?.postProcessing?.resin?.gramsPerCm2, 0));
  return topAreaCm2(size || part?.orientedSize || part?.geometry?.size) * perCm2;
}

export function makeMovement(spec = {}) {
  return {
    id: makeId('mv'),
    at: nowIso(),
    itemId: null,
    reason: 'adjustment',
    /** Signed. Positive adds to stock, negative removes. */
    quantity: 0,
    unitCost: null,
    projectId: null,
    partId: null,
    /** The production attempt this movement belongs to, so deleting that print
     *  can take its stock back out again. Null for movements not tied to a run. */
    runId: null,
    note: '',
    ...spec,
  };
}

/** The balance of every item, folded from the log. */
export function balances(items, movements) {
  const totals = new Map();
  for (const item of items) {
    totals.set(item.id, {
      item,
      quantity: byWeight(item) ? num(item.startingG) : 0,
      movements: 0,
      lastAt: null,
    });
  }
  for (const movement of movements) {
    const entry = totals.get(movement.itemId);
    if (!entry) continue;
    entry.quantity += num(movement.quantity);
    entry.movements += 1;
    if (!entry.lastAt || movement.at > entry.lastAt) entry.lastAt = movement.at;
  }
  return [...totals.values()];
}

export function balanceOf(items, movements, itemId) {
  return balances(items, movements).find((b) => b.item.id === itemId) || null;
}

/** Anything at or below its reorder point, worst first. */
export function lowStock(items, movements) {
  return balances(items, movements)
    .filter((b) => !b.item.archived && b.quantity <= num(b.item.reorderAt))
    .sort((a, b) => (a.quantity - num(a.item.reorderAt)) - (b.quantity - num(b.item.reorderAt)));
}

/**
 * The movements a finished production run implies.
 *
 * Returned rather than applied, so the caller decides whether stock is really
 * being booked out - a quote must never move stock, and it is easy to end up
 * calling the same helper from both places.
 */
export function movementsForRun({
  project, part, attempt, result, settings,
}) {
  const out = [];
  const quantity = Math.max(1, num(attempt.quantity, 1));

  const grams = num(attempt.grams) > 0
    ? num(attempt.grams)
    : num(result?.estimate?.grams) * quantity;
  if (grams > 0 && part.materialId) {
    const material = findMaterial(settings.materials, part.materialId);
    out.push(makeMovement({
      itemId: attempt.spoolId || `material:${part.materialId}`,
      reason: attempt.failed ? 'scrap' : 'production',
      quantity: -grams,
      unitCost: pricePerGram(material, settings.countryId),
      projectId: project?.id || null,
      partId: part.id,
      runId: attempt.id || null,
      note: `${attempt.failed ? 'Failed print' : 'Print'} of ${part.name}`,
    }));
  }

  for (const entry of part.hardware || []) {
    const spec = findHardware(settings.hardware, entry.hardwareId);
    if (!spec) continue;
    const used = Math.max(0, num(entry.qty, 1)) * quantity;
    if (used <= 0) continue;
    out.push(makeMovement({
      itemId: `hardware:${spec.id}`,
      reason: attempt.failed ? 'scrap' : 'production',
      quantity: -used,
      unitCost: itemPrice(spec, settings.countryId),
      projectId: project?.id || null,
      partId: part.id,
      runId: attempt.id || null,
      note: spec.name,
    }));
  }

  return out;
}

/** Packaging leaves stock when the order ships, not when it is printed. */
export function movementsForDespatch({ project, packaging, settings }) {
  return (packaging?.lines || []).map((line) => {
    const spec = findPackaging(settings.packaging, line.id);
    return makeMovement({
      itemId: `packaging:${line.id}`,
      reason: 'production',
      quantity: -Math.max(0, num(line.qty, 1)),
      unitCost: spec ? itemPrice(spec, settings.countryId) : null,
      projectId: project?.id || null,
      note: `Despatch of ${project?.name || 'order'}`,
    });
  });
}

/** What the stock on hand is worth. */
export function stockValue(items, movements, settings) {
  let total = 0;
  const lines = [];
  for (const balance of balances(items, movements)) {
    const { item, quantity } = balance;
    if (item.archived) continue;
    let unit = 0;
    if (item.kind === 'filament') {
      unit = num(pricePerGram(findMaterial(settings.materials, item.materialId), settings.countryId));
    } else if (item.kind === 'hardware') {
      unit = itemPrice(findHardware(settings.hardware, item.refId), settings.countryId);
    } else if (item.kind === 'packaging') {
      unit = itemPrice(findPackaging(settings.packaging, item.refId), settings.countryId);
    }
    const value = Math.max(0, quantity) * unit;
    total += value;
    lines.push({ item, quantity, unit, value });
  }
  return { lines, total };
}

/** Spools of one material, fullest first, so the part-used one gets finished. */
export function spoolsFor(items, movements, materialId) {
  return balances(items, movements)
    .filter((b) => b.item.kind === 'filament' && b.item.materialId === materialId && !b.item.archived)
    .sort((a, b) => a.quantity - b.quantity)
    .filter((b) => b.quantity > 0);
}

/**
 * Whether one material is in stock, and enough of it for a job.
 *
 * `tracked` is the honest escape hatch: if the material has no spool recorded in
 * inventory at all, the app does not know either way and should not nag - a
 * workshop that keeps no stock records has said, in effect, "do not flag this".
 * Once even one spool is recorded, the numbers are believed and a shortfall is
 * flagged.
 */
/**
 * Resin on hand, across every resin bottle, and whether it covers a job.
 *
 * Like materialStock: untracked (no bottle recorded) means "do not nag". Once a
 * bottle is booked in, a shortfall is flagged so a resined job is not started
 * without enough resin to finish it.
 */
export function resinStock(inventory, requiredG = 0) {
  const items = inventory?.items || [];
  const movements = inventory?.movements || [];
  const tracked = items.some((i) => i.kind === 'resin' && !i.archived);
  const onHandG = balances(items, movements)
    .filter((b) => b.item.kind === 'resin' && !b.item.archived)
    .reduce((t, b) => t + Math.max(0, num(b.quantity)), 0);
  const req = Math.max(0, num(requiredG));
  return {
    tracked,
    onHandG,
    inStock: onHandG > 0,
    enough: !tracked || onHandG >= req,
    shortG: Math.max(0, req - onHandG),
  };
}

/** The resin bottle to book production against — the one with the least left. */
export function resinItemFor(inventory) {
  const items = inventory?.items || [];
  const movements = inventory?.movements || [];
  const resin = balances(items, movements)
    .filter((b) => b.item.kind === 'resin' && !b.item.archived && b.quantity > 0)
    .sort((a, b) => a.quantity - b.quantity);
  return resin[0]?.item || items.find((i) => i.kind === 'resin' && !i.archived) || null;
}

export function materialStock(inventory, materialId, requiredG = 0) {
  const items = inventory?.items || [];
  const movements = inventory?.movements || [];
  const tracked = items.some(
    (i) => i.kind === 'filament' && i.materialId === materialId && !i.archived,
  );
  const spools = spoolsFor(items, movements, materialId);
  const onHandG = spools.reduce((t, s) => t + Math.max(0, num(s.quantity)), 0);
  const req = Math.max(0, num(requiredG));
  return {
    tracked,
    onHandG,
    spoolCount: spools.length,
    inStock: onHandG > 0,
    enough: !tracked || onHandG >= req,
    shortG: Math.max(0, req - onHandG),
  };
}
