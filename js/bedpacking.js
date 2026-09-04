/**
 * Several different parts sharing one bed. Pure.
 *
 * A workshop rarely prints one part shape at a time. It loads the printer once
 * and puts everything due that needs the same filament on the plate together:
 * ten brackets, four housings, twenty clips. This module answers the question
 * that raises - how many physical plates does the WHOLE bed need, and which
 * parts sit on which one - so that a purge tower and a plate changeover are
 * charged once per physical run, not once per part TYPE.
 *
 * The model, stated plainly because it is an approximation and must not be
 * mistaken for a nesting engine:
 *
 *   Each part type's own density on an otherwise-empty plate is already known
 *   from `partsPerPlate` - the real grid-fit for THAT shape, which already
 *   accounts for its own packing waste (a long thin part wastes differently
 *   from a round one). That density is turned into a COST: one unit of a type
 *   that fits 12-to-a-plate costs 1/12 of a plate; a type that only fits 4-to-a-
 *   plate costs 1/4. Plates are then filled with these costs by first-fit
 *   decreasing, the standard cheap heuristic for bin packing, largest cost
 *   first so the awkward shapes are placed while there is still room to choose.
 *
 * This is a floor, not a nesting promise, in exactly the sense `partsPerPlate`
 * already is - a person who has actually laid the plates out in slicer software
 * knows better, and every line still carries its own override.
 */

import { num } from './money.js';
import { partsPerPlate } from './geometry.js';

/**
 * How much of a plate one unit of a shape costs, and whether it fits at all.
 *
 * `reservedArea` is NOT applied here - the tower is a once-per-plate cost,
 * charged in `packBed`, not smeared across every type's per-unit cost.
 */
function unitCost(size, build, gap, margin) {
  const solo = partsPerPlate(size, build, { gap, margin, reservedArea: 0 });
  return solo > 0 ? 1 / solo : Infinity;
}

/**
 * Pack several part types onto shared plates.
 *
 * @param {Array<{id:string, size:{x,y,z}, quantity:number}>} items  already
 *   ORIENTED sizes - the caller has decided which way up each part goes.
 * @param {{x:number,y:number,z:number}} build
 * @param {object} [options]
 * @param {number} [options.gap]
 * @param {number} [options.margin]
 * @param {number} [options.reservedArea]  a purge tower's own footprint, taken
 *   off every plate the bed needs, once per plate - never once per type.
 */
export function packBed(items, build, { gap = 8, margin = 10, reservedArea = 0 } = {}) {
  const live = (items || []).filter((it) => Math.max(0, Math.round(num(it.quantity, 0))) > 0);

  // The tower's own cost, as a fraction of one plate. Charged once per plate
  // below - never once per part type, which would double it up whenever more
  // than one shape shares the bed.
  const usableArea = Math.max(0, (num(build?.x) - margin * 2)) * Math.max(0, (num(build?.y) - margin * 2));
  const towerFraction = usableArea > 0 ? Math.min(1, Math.max(0, num(reservedArea)) / usableArea) : 0;
  const plateBudget = Math.max(0, 1 - towerFraction);

  const impossible = [];
  const costed = live.map((it) => {
    const cost = unitCost(it.size, build, gap, margin);
    if (!Number.isFinite(cost) || plateBudget <= 0) impossible.push(it.id);
    return { ...it, unitCost: cost };
  }).filter((it) => Number.isFinite(it.unitCost) && plateBudget > 0);

  // First-fit decreasing: the most space-hungry shapes are placed first, while
  // every plate still has room to choose from - the standard reason FFD beats
  // placing items in arrival order.
  const queue = [];
  for (const it of costed) {
    for (let i = 0; i < Math.round(num(it.quantity)); i += 1) queue.push({ id: it.id, unitCost: it.unitCost });
  }
  queue.sort((a, b) => b.unitCost - a.unitCost);

  const plates = [];
  for (const unit of queue) {
    let plate = plates.find((p) => p.used + unit.unitCost <= plateBudget + 1e-9);
    if (!plate) {
      plate = { used: 0, items: new Map() };
      plates.push(plate);
    }
    plate.used += unit.unitCost;
    plate.items.set(unit.id, (plate.items.get(unit.id) || 0) + 1);
  }

  const perItem = {};
  for (const it of live) {
    perItem[it.id] = {
      totalUnits: Math.max(0, Math.round(num(it.quantity, 0))),
      plateCounts: plates.map((p) => p.items.get(it.id) || 0),
    };
  }

  return {
    jobs: plates.length,
    plateBudget,
    towerFraction,
    plates: plates.map((p) => ({
      used: p.used,
      items: [...p.items.entries()].map(([id, count]) => ({ id, count })),
    })),
    perItem,
    impossible,
  };
}

/**
 * For one item, the numbers `calculateLine` actually needs: how many physical
 * plates it appears on, and its average count per plate it appears on - which
 * is the honest replacement for a solo `perPlate` figure once the bed is
 * shared with other shapes.
 */
export function itemPlacement(packed, id) {
  const entry = packed.perItem[id];
  if (!entry || entry.totalUnits <= 0) {
    return { jobs: 0, perPlate: 0, plateCounts: [] };
  }
  const platesUsed = entry.plateCounts.filter((c) => c > 0).length;
  return {
    jobs: Math.max(1, platesUsed),
    perPlate: platesUsed > 0 ? entry.totalUnits / platesUsed : entry.totalUnits,
    plateCounts: entry.plateCounts,
  };
}
