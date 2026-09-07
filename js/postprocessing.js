/**
 * Post-processing: the finishing that happens AFTER the print. Pure.
 *
 * Finishing is a CONFIGURABLE list of operations the workshop edits in Settings,
 * not a fixed set baked into the code. Each operation prices one of three ways:
 *
 *   perPart   a flat labour time (and optional consumable) on every part that
 *             gets it — support removal, deburring.
 *   perArea   time and consumable that scale with the TOP AREA in cm² — a resin
 *             coat, whose labour, its resin and its grams-for-stock all follow
 *             the area, with an unattended cure afterwards.
 *   perUnit   time per matching component — coding each embedded NFC tag, or
 *             fitting each after-print insert. The time is either the operation's
 *             own figure or, with minutesFrom:'component', each component's own
 *             fitting time so a big module can cost more than a heat-set insert.
 *
 * An operation is only offered when it is RELEVANT, decided by its gate:
 *   always     every part may choose it.
 *   category   a component of that category is present.
 *   nfc        an NFC component is present.
 *   after      an after-print component is present.
 *
 * A `perComponent` operation expands to one choice per matching component (fit
 * THIS insert, ship THAT screw loose); otherwise it is one choice for the part
 * (code the tag). All of it is done on the parts that SURVIVED the print, which
 * is why the engine adds this after the at-risk cost and never multiplies it by
 * scrap — a failed print was never resined, coded or assembled.
 */

import { num } from './money.js';

/** Legacy per-part booleans and the operation each becomes. */
const LEGACY_BOOL = {
  needsSupport: 'remove-support',
  needsResin: 'resin-coat',
  needsDeburring: 'deburring',
  nfcCode: 'nfc-coding',
};

/**
 * The operations a fresh install ships with — the historic five. Editing,
 * adding to or removing from this list is exactly what the Settings section
 * does; nothing here is otherwise special.
 */
export const DEFAULT_POST_OPS = [
  {
    id: 'remove-support', name: 'Remove support',
    hint: 'Cut away and clean off support material — only on parts that print with it.',
    basis: 'perPart', minutes: 3, materialCost: 0, materialGrams: 0, stationMinutes: 0,
    gate: { kind: 'always' }, perComponent: false, archived: false,
  },
  {
    id: 'resin-coat', name: 'Resin coat (top surface)',
    hint: 'Resin over the top face, priced by top area with a curing time.',
    basis: 'perArea', minutes: 0.5, materialCost: 0, materialGrams: 2, stationMinutes: 15,
    gate: { kind: 'always' }, perComponent: false, archived: false,
  },
  {
    id: 'deburring', name: 'Deburring / cleanup',
    hint: 'Deburr, trim seams, wipe down. Leave off to ship exactly as it comes off the printer.',
    basis: 'perPart', minutes: 2, materialCost: 0, materialGrams: 0, stationMinutes: 0,
    gate: { kind: 'always' }, perComponent: false, archived: false,
  },
  {
    id: 'nfc-coding', name: 'Code the NFC tag',
    hint: 'Program and verify an embedded NFC tag.',
    basis: 'perUnit', minutes: 2, minutesFrom: 'op', materialCost: 0, materialGrams: 0, stationMinutes: 0,
    gate: { kind: 'nfc' }, perComponent: false, archived: false,
  },
  {
    id: 'fit', name: 'Fit',
    hint: 'Assemble an after-print component onto the finished part before it ships.',
    basis: 'perUnit', minutes: 0, minutesFrom: 'component', materialCost: 0, materialGrams: 0, stationMinutes: 0,
    gate: { kind: 'after' }, perComponent: true, archived: false,
  },
];

/**
 * The top area a resin coat covers, in cm², from a part's bounding box in mm.
 *
 * The honest estimate without a mesh is the plan-view footprint - the part laid
 * flat - which is the two horizontal dimensions. mm² converts to cm² by 100.
 */
export function topAreaCm2(size) {
  const x = Math.max(0, num(size?.x));
  const y = Math.max(0, num(size?.y));
  return (x * y) / 100;
}

/**
 * The whole-part operations a part has chosen, as a `{ opId: true }` map.
 * Reads the new `part.postProcessing` map and folds in the historic booleans so
 * a project saved before the configurable list still prices exactly the same.
 */
export function normalizePostSelection(part) {
  const src = part && typeof part.postProcessing === 'object' && part.postProcessing
    ? part.postProcessing : {};
  const out = {};
  for (const [k, v] of Object.entries(src)) if (v === true) out[k] = true;
  for (const [field, opId] of Object.entries(LEGACY_BOOL)) {
    if (part && part[field] === true && out[opId] === undefined) out[opId] = true;
  }
  return out;
}

/** The per-operation choices on one component entry, folding in legacy `fit`. */
export function entryPostOps(entry) {
  const ops = entry && typeof entry.ops === 'object' && entry.ops ? entry.ops : {};
  const out = {};
  for (const [k, v] of Object.entries(ops)) if (v === true) out[k] = true;
  if (entry && entry.fit === true && out.fit === undefined) out.fit = true;
  return out;
}

/** Whether a component matches an operation's gate. */
export function gateMatches(gate, spec) {
  if (!spec) return false;
  const kind = gate?.kind || 'always';
  if (kind === 'category') return spec.category === gate.category;
  if (kind === 'nfc') return !!spec.nfc;
  if (kind === 'after') return spec.stage === 'after';
  return true;
}

/**
 * The money and time one part's post-processing adds.
 *
 * `ops` is the configured list, `selected` the part's whole-part choices,
 * `hardware` its component entries (each may carry per-op choices), `catalogue`
 * the hardware specs (for gating and each component's own fitting time),
 * `areaCm2` the top area, `rate` the hourly labour rate. Returns the labour and
 * material money separately and a `cost` that is the total added to the part.
 */
export function postProcessing({
  ops = [], selected = {}, areaCm2 = 0, hardware = [], catalogue = [], rate = 0,
} = {}) {
  const hourly = Math.max(0, num(rate));
  const area = Math.max(0, num(areaCm2));
  const entries = Array.isArray(hardware) ? hardware : [];
  const specOf = (e) => (catalogue || []).find((h) => h.id === e.hardwareId);

  let labourMinutes = 0;
  let stationMinutes = 0;
  let materialCost = 0;
  let materialGrams = 0;
  const applied = [];

  for (const op of ops || []) {
    if (!op || op.archived) continue;
    const gate = op.gate || { kind: 'always' };
    const matches = entries
      .map((e) => ({ e, spec: specOf(e) }))
      .filter(({ e, spec }) => spec && Math.round(num(e.qty, 1)) > 0 && gateMatches(gate, spec));

    let mins = 0;
    let mcost = 0;
    let mgrams = 0;
    let station = 0;
    let units = 0;

    if (op.perComponent) {
      for (const { e, spec } of matches) {
        if (entryPostOps(e)[op.id] !== true) continue;
        const qty = Math.max(0, Math.round(num(e.qty, 1)));
        const each = op.minutesFrom === 'component' ? num(spec.insertMinutes) : num(op.minutes);
        mins += Math.max(0, each) * qty;
        mcost += Math.max(0, num(op.materialCost)) * qty;
        mgrams += Math.max(0, num(op.materialGrams)) * qty;
        units += qty;
      }
      if (units <= 0) continue;
      station = Math.max(0, num(op.stationMinutes));
    } else {
      if (selected[op.id] !== true) continue;
      if (gate.kind && gate.kind !== 'always' && matches.length === 0) continue;

      if (op.basis === 'perArea') {
        if (area <= 0) continue;
        mins = Math.max(0, num(op.minutes)) * area;
        mcost = Math.max(0, num(op.materialCost)) * area;
        mgrams = Math.max(0, num(op.materialGrams)) * area;
        station = Math.max(0, num(op.stationMinutes));
        units = 1;
      } else if (op.basis === 'perUnit') {
        for (const { e, spec } of matches) {
          const qty = Math.max(0, Math.round(num(e.qty, 1)));
          const each = op.minutesFrom === 'component' ? num(spec.insertMinutes) : num(op.minutes);
          mins += Math.max(0, each) * qty;
          units += qty;
        }
        if (units <= 0) continue;
        mcost = Math.max(0, num(op.materialCost)) * units;
        mgrams = Math.max(0, num(op.materialGrams)) * units;
        station = Math.max(0, num(op.stationMinutes));
      } else { // perPart
        mins = Math.max(0, num(op.minutes));
        mcost = Math.max(0, num(op.materialCost));
        mgrams = Math.max(0, num(op.materialGrams));
        station = Math.max(0, num(op.stationMinutes));
        units = 1;
      }
    }

    const cost = mcost + (mins / 60) * hourly;
    labourMinutes += mins;
    stationMinutes += station;
    materialCost += mcost;
    materialGrams += mgrams;
    applied.push({
      id: op.id, name: op.name, basis: op.basis, minutes: mins, station, units,
      materialGrams: mgrams, materialCost: mcost, cost,
    });
  }

  const labourCost = (labourMinutes / 60) * hourly;
  return {
    applies: applied.length > 0,
    labourMinutes,
    stationMinutes,
    materialCost,
    materialGrams,
    labourCost,
    /** Total money added to the finished part: consumables plus the labour. */
    cost: materialCost + labourCost,
    applied,
  };
}

/**
 * Whether a part has any post-processing that routes an order through the
 * Post-processing phase. Reads the configured ops so a bespoke operation counts
 * too, and falls back to "any selection at all" when no ops are supplied.
 */
export function partHasPostProcessing(part) {
  const selected = normalizePostSelection(part);
  if (Object.keys(selected).length > 0) return true;
  const entries = Array.isArray(part?.hardware) ? part.hardware : [];
  return entries.some((e) => Object.keys(entryPostOps(e)).length > 0);
}

/**
 * Migrate the stored post-processing settings to the configurable list.
 *
 * Old installs stored `{ resin:{…}, nfc:{…} }` and priced support/deburring as
 * labour operations; the caller passes those two minute figures so they carry
 * across unchanged. An install already on the new `{ ops:[…] }` shape is kept,
 * with any missing default operations appended so a new default becomes visible.
 */
export function migratePostProcessing(old, { supportMinutes = null, deburrMinutes = null } = {}) {
  const seed = () => DEFAULT_POST_OPS.map((o) => ({ ...o, gate: { ...o.gate } }));

  if (old && Array.isArray(old.ops)) {
    const ops = old.ops.map((o) => ({ ...o, gate: { ...(o.gate || { kind: 'always' }) } }));
    const have = new Set(ops.map((o) => o.id));
    for (const def of seed()) if (!have.has(def.id)) ops.push(def);
    return { ops };
  }

  const resin = (old && old.resin) || {};
  const nfc = (old && old.nfc) || {};
  const ops = seed();
  const set = (id, patch) => {
    const o = ops.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  };
  if (resin.minutesPerCm2 != null) set('resin-coat', { minutes: num(resin.minutesPerCm2) });
  if (resin.costPerCm2 != null) set('resin-coat', { materialCost: num(resin.costPerCm2) });
  if (resin.gramsPerCm2 != null) set('resin-coat', { materialGrams: num(resin.gramsPerCm2) });
  if (resin.curingMinutes != null) set('resin-coat', { stationMinutes: num(resin.curingMinutes) });
  if (nfc.codingMinutes != null) set('nfc-coding', { minutes: num(nfc.codingMinutes) });
  if (supportMinutes != null) set('remove-support', { minutes: num(supportMinutes) });
  if (deburrMinutes != null) set('deburring', { minutes: num(deburrMinutes) });
  return { ops };
}
