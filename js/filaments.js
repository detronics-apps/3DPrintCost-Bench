/**
 * What is loaded in the machine, and how much of a part is each of them. Pure.
 *
 * A **slot** is one spool sitting in the printer. What may vary between slots
 * is decided by the machine, not by the app:
 *
 *   single         one slot, full stop
 *   manual         one extruder, but the print pauses and somebody swaps the
 *                  spool. Anything can go in; every change costs a person
 *   multicolour    many slots, colours vary, the plastic does not - one hotend
 *                  has one temperature
 *   multimaterial  many slots, both vary - each head has its own hotend
 *
 * A **mix** says what share of one part is each slot. It is entered per part
 * and it always adds to 100%: a share that does not is not a modelling choice,
 * it is a typo, and this module corrects it and says so rather than quietly
 * pricing 87% of a part.
 */

import { num } from './money.js';
import { colourMode, slotLimit } from './printers.js';
import { findMaterial, materialType, materialLabel, pricePerGram, density } from './materials.js';

let counter = 0;
const nextId = () => { counter += 1; return `f${counter}${Math.random().toString(36).slice(2, 6)}`; };

export const makeSlot = (materialId, id = null) => ({ id: id || nextId(), materialId });

/** The slots a printer starts with when nothing has been chosen yet. */
export function defaultSlots(printerSpec, materialId) {
  return [makeSlot(materialId, 'main')];
}

/**
 * Bring a slot list into line with what the machine can actually do.
 *
 * Returns the corrected list AND what had to change, because a machine that
 * silently drops the third spool you loaded is worse than one that says it
 * cannot hold three.
 */
export function reconcileSlots(slots, printerSpec, materials) {
  const mode = colourMode(printerSpec);
  const limit = slotLimit(printerSpec);
  const notes = [];

  let out = (slots || []).filter((s) => s && s.id).map((s) => ({ ...s }));
  if (!out.length) out = [makeSlot(materials?.[0]?.id, 'main')];

  if (out.length > limit) {
    notes.push({
      level: 'warn',
      text: `${printerSpec?.name || 'This printer'} holds ${limit} `
        + `${limit === 1 ? 'spool' : 'spools'} at once, so `
        + `${out.length - limit} of the ${out.length} loaded here `
        + `${out.length - limit === 1 ? 'has' : 'have'} been dropped.`,
    });
    out = out.slice(0, limit);
  }

  // One hotend means one temperature. Colours may differ; the plastic may not.
  if (!mode.materialsVary && out.length > 1) {
    const first = findMaterial(materials, out[0].materialId);
    const strays = out.slice(1)
      .map((s) => findMaterial(materials, s.materialId))
      .filter((m) => m && m.type !== first.type);

    if (strays.length) {
      notes.push({
        level: 'warn',
        text: `${printerSpec?.name || 'This printer'} feeds one hotend, so every spool has `
          + `to be the same plastic. ${[...new Set(strays.map((m) => materialType(m.type).name))].join(' and ')} `
          + `${strays.length === 1 ? 'has' : 'have'} been moved to ${materialType(first.type).name}.`,
      });
      out = out.map((slot, i) => {
        if (i === 0) return slot;
        const m = findMaterial(materials, slot.materialId);
        if (!m || m.type === first.type) return slot;
        const swap = materials.find((x) => !x.archived && x.type === first.type && x.colour === m.colour)
          || materials.find((x) => !x.archived && x.type === first.type);
        return swap ? { ...slot, materialId: swap.id } : slot;
      });
    }
  }

  if (mode.manual && out.length > 1) {
    const types = [...new Set(out
      .map((s) => findMaterial(materials, s.materialId))
      .filter(Boolean)
      .map((m) => m.type))];
    if (types.length > 1) {
      notes.push({
        level: 'warn',
        text: 'Swapping between different plastics mid-print works mechanically — the '
          + 'temperature can be changed at the pause — but the layer where '
          + `${types.map((t) => materialType(t).name).join(' meets ')} will be the weakest `
          + 'in the part. Print a test one before promising it.',
      });
    }
  }

  return { slots: out, notes, mode, limit };
}

/** Can another spool be loaded? */
export const canAddSlot = (slots, printerSpec) => (slots || []).length < slotLimit(printerSpec);

/**
 * The mix after one share has been typed, with the rest brought back to 100%.
 *
 * Typing 90 into one of two spools should put 10 in the other, immediately, on
 * screen. Leaving the reader to work out the complement themselves is how a
 * split ends up adding to 87% and being quietly scaled.
 *
 * With more than two, the change waterfalls: the NEXT spool absorbs as much of
 * it as it can, and only what it cannot hold flows on to the one after. That is
 * predictable in a way that spreading the difference proportionally is not -
 * you can see which number your edit moved.
 */
export function rebalanceMix(mix, slots, changedSlotId, percent) {
  const entries = normaliseMix(mix, slots).entries
    .map((e) => ({ slotId: e.slotId, percent: e.percent }));
  const index = entries.findIndex((e) => e.slotId === changedSlotId);
  if (index < 0) return entries;

  entries[index].percent = Math.min(100, Math.max(0, num(percent)));
  let remaining = 100 - entries[index].percent;

  // The others in order, starting with the one after the edited slot.
  const order = [];
  for (let k = 1; k < entries.length; k += 1) order.push((index + k) % entries.length);

  // Each keeps as much of its current share as still fits; the shortfall flows
  // on to the next. Anything left over at the end lands on the spool nearest
  // the edit, which is the one the reader is looking at.
  for (const j of order) {
    const give = Math.min(entries[j].percent, remaining);
    entries[j].percent = give;
    remaining -= give;
  }
  if (remaining > 0 && order.length) entries[order[0]].percent += remaining;

  return entries;
}

/**
 * The mix, as fractions that add to exactly one.
 *
 * Rules, in order:
 *   - a mix that names slots which are gone has those entries dropped
 *   - a slot with no entry contributes nothing
 *   - an empty or all-zero mix is an EVEN split across every loaded spool
 *   - anything else is scaled so the shares add to 1, and `scaled` says so
 *
 * The even split matters more than it looks. Somebody who has just loaded a
 * second colour has said they intend to use it; defaulting to 100% of the first
 * meant loading a spool changed nothing on screen, which reads as the control
 * being broken. With one spool an even split is 100% anyway, so nothing that
 * worked before behaves differently.
 */
export function normaliseMix(mix, slots) {
  const ids = new Set(slots.map((s) => s.id));
  const entries = (mix || [])
    .filter((m) => ids.has(m.slotId))
    .map((m) => ({ slotId: m.slotId, percent: Math.max(0, num(m.percent)) }));

  const dropped = (mix || []).length - entries.length;
  const total = entries.reduce((t, m) => t + m.percent, 0);

  if (total <= 0) {
    const share = slots.length ? 100 / slots.length : 0;
    return {
      entries: slots.map((s) => ({ slotId: s.id, percent: share, fraction: slots.length ? 1 / slots.length : 0 })),
      scaled: false,
      dropped,
      typed: total,
    };
  }

  return {
    entries: slots.map((s) => {
      const hit = entries.find((m) => m.slotId === s.id);
      const percent = hit ? hit.percent : 0;
      return { slotId: s.id, percent, fraction: percent / total };
    }),
    // The reader typed something that does not add to 100. Scaling is the only
    // sane thing to do with it, and saying so is the only honest thing.
    scaled: Math.abs(total - 100) > 0.05,
    dropped,
    typed: total,
  };
}

/**
 * The mix after a spool has been loaded.
 *
 * `normaliseMix` deliberately leaves an explicit mix alone, which is right: a
 * number somebody typed is not the app's to rewrite. But that made loading a
 * spool do nothing at all whenever a mix had ever been typed - the new spool
 * sat at 0% and the price did not move, which reads as a broken button.
 *
 * So the ACTION seeds the new entry: it takes an even share and the existing
 * shares are scaled down to make room, keeping their proportions to each other
 * and the total at 100.
 */
export function mixWithSlotAdded(mix, slotsBefore, newSlotId) {
  const before = normaliseMix(mix, slotsBefore);
  const count = slotsBefore.length + 1;
  const share = 100 / count;
  const scale = (100 - share) / 100;

  return [
    ...before.entries.map((e) => ({ slotId: e.slotId, percent: e.fraction * 100 * scale })),
    { slotId: newSlotId, percent: share },
  ];
}

export function mixWarnings(normalised, { partName = 'This part' } = {}) {
  const notes = [];
  if (normalised.scaled) {
    notes.push({
      level: 'warn',
      text: `${partName}’s colour split adds up to ${normalised.typed.toFixed(1)}%, not 100%. `
        + 'It has been scaled to fit; correct it if that is not what you meant.',
    });
  }
  if (normalised.dropped > 0) {
    notes.push({
      level: 'info',
      text: `${normalised.dropped} part of the colour split pointed at a spool that is no `
        + 'longer loaded, and has been dropped.',
    });
  }
  return notes;
}

/**
 * Turn a mix into what it costs.
 *
 * The split is by VOLUME and only then converted to grams, because different
 * plastics have different densities: half the volume in PLA and half in PC is
 * not half the weight each. Getting that backwards is a quiet 3% error that
 * nobody ever finds.
 */
export function materialBreakdown(bodyVolumeMm3, slots, normalised, materials, countryId) {
  const lines = [];
  let grams = 0;
  let cost = 0;
  let missingPrice = false;

  for (const entry of normalised.entries) {
    if (entry.fraction <= 0) continue;
    const slot = slots.find((s) => s.id === entry.slotId);
    const material = findMaterial(materials, slot?.materialId);
    const volume = Math.max(0, num(bodyVolumeMm3)) * entry.fraction;
    const g = (volume / 1000) * density(material);
    const perGram = pricePerGram(material, countryId);
    if (perGram == null) missingPrice = true;

    lines.push({
      slotId: entry.slotId,
      material,
      label: materialLabel(material),
      percent: entry.percent,
      fraction: entry.fraction,
      volume,
      grams: g,
      perGram: perGram == null ? null : perGram,
      cost: num(perGram) * g,
      wasteFactor: Math.max(0, num(material?.wasteFactor, 0.03)),
    });
    grams += g;
    cost += num(perGram) * g;
  }

  return { lines, grams, cost, missingPrice };
}

/** The mix as `[{ material, fraction }]`, which is what the estimator wants. */
export function mixForEstimate(slots, normalised, materials) {
  return normalised.entries
    .filter((e) => e.fraction > 0)
    .map((e) => ({
      material: findMaterial(materials, slots.find((s) => s.id === e.slotId)?.materialId),
      fraction: e.fraction,
    }));
}

/** The slot with the largest share: what supports and the purge tower print in. */
export function primarySlot(slots, normalised, materials) {
  const best = [...normalised.entries].sort((a, b) => b.fraction - a.fraction)[0];
  const slot = slots.find((s) => s.id === best?.slotId) || slots[0];
  return findMaterial(materials, slot?.materialId);
}

/** How many spools this part actually uses. */
export const slotsUsed = (normalised) => normalised.entries.filter((e) => e.fraction > 0).length;

/**
 * The purge tower.
 *
 * A machine that changes filament without somebody standing there has to put
 * the purged material somewhere, and that somewhere is a tower printed
 * alongside the part, as tall as the part is. It matters twice:
 *
 *   - it takes up bed area, so fewer parts fit on a plate, so more plates are
 *     needed, so there is more changeover labour
 *   - it is where the purge material ends up
 *
 * The tower is NOT counted as material on top of the purge: it is the shape the
 * purge takes. Counting both would charge the same plastic twice. What the
 * tower adds that the purge figure does not is SPACE.
 *
 * A pause-and-change machine has no tower - the person purges into a bin - and
 * a single-colour machine has nothing to purge.
 */
export const DEFAULT_TOWER = { x: 30, y: 30 };

export function purgeTower(printerSpec, normalised, { height = 0, footprint = DEFAULT_TOWER } = {}) {
  const mode = colourMode(printerSpec);
  const used = slotsUsed(normalised);
  const needed = used > 1 && mode.coloursVary && !mode.manual;

  if (!needed) {
    return { needed: false, x: 0, y: 0, height: 0, area: 0, volume: 0 };
  }

  const x = Math.max(0, num(footprint?.x, DEFAULT_TOWER.x));
  const y = Math.max(0, num(footprint?.y, DEFAULT_TOWER.y));
  const h = Math.max(0, num(height));

  return {
    needed: true,
    x,
    y,
    height: h,
    area: x * y,
    /** The space it occupies, not a second helping of plastic. */
    volume: x * y * h,
  };
}

/**
 * Changes per print, and what each one actually wastes.
 *
 * The three ways a machine changes filament waste plastic in genuinely
 * different amounts, and flattening them into "a purge per change" gets two of
 * the three badly wrong:
 *
 *   multicolour (AMS-style)  ONE hotend fed from several spools. Every layer
 *                            that contains a transition has to purge the last
 *                            colour out before the next one is clean. The waste
 *                            therefore scales with LAYERS, and on a tall
 *                            multi-colour model it can exceed the part itself.
 *
 *   multimaterial (toolchanger)  Each head keeps its own filament loaded and
 *                            hot. A head primes ONCE, at the start, and after
 *                            that a change is a tool swap: time, and no plastic
 *                            at all. Waste scales with the number of heads used,
 *                            not with the number of changes.
 *
 *   manual                   Somebody pushes the old colour out by hand at the
 *                            pause. One purge per swap, and a swap on every part.
 *
 * Purge is measured as a VOLUME, not a weight, because that is what a slicer
 * calls it - the "flush volume" per transition - and because what it weighs
 * depends on which plastic is being flushed. The conversion happens once, at
 * the end, against the material actually in the machine.
 *
 * `interleave` is the app's assumption about what fraction of layers contain a
 * transition, because only the slicer really knows. It is editable and it is
 * labelled an assumption wherever it is shown.
 */
export function changeModel(printerSpec, normalised, {
  layers = 0,
  interleave = 0.15,
  purgePerChangeMm3 = 800,
  primePerSpoolMm3 = 2500,
  changeSeconds = null,
} = {}) {
  // Everything here is worked out PER PLATE. Colour changes are shared by every
  // part on the bed - one purge or one hand-swap serves them all - so nothing
  // in this function scales with the number of parts. The engine multiplies the
  // result by the number of plates and divides across the parts on them.
  const mode = colourMode(printerSpec);
  const used = slotsUsed(normalised);
  // Every change stops the machine printing for a moment. That is MACHINE time
  // - the printer does it by itself - and it belongs with machine cost and
  // electricity, never with labour.
  const perChange = Math.max(0, num(changeSeconds ?? printerSpec?.changeSeconds, 0));

  const none = {
    mode: mode.id,
    used,
    changes: 0,
    manualChanges: 0,
    purgeEvents: 0,
    purgeVolume: 0,
    machineSeconds: 0,
    changeSeconds: perChange,
  };

  if (used <= 1) return { ...none, used, basis: 'one spool, so nothing changes' };
  if (!mode.coloursVary) return { ...none, used: 1, basis: 'one colour only' };

  if (mode.manual) {
    // A person swaps the spool once per extra colour - but once for the whole
    // PLATE, not once per part. The printer pauses at the layer, the colour is
    // changed, and every part on the bed carries on in it. Ten parts on one
    // plate is the same one swap as a single part; the engine multiplies this
    // by the number of plates, never by the number of parts.
    const manual = used - 1;
    return {
      mode: mode.id,
      used,
      changes: manual,
      manualChanges: manual,
      purgeEvents: manual,
      purgeVolume: manual * Math.max(0, num(purgePerChangeMm3)),
      // The machine is stopped while somebody swaps the spool, so it is
      // occupied for as long as that takes even though it is not printing.
      machineSeconds: manual * perChange,
      changeSeconds: perChange,
      basis: `${used} spools swapped by hand, so somebody goes to the machine `
        + `${manual} time${manual === 1 ? '' : 's'} per plate — shared by every part on it`,
    };
  }

  if (mode.materialsVary) {
    // A toolchanger. Each head primes once at the start and then keeps its
    // filament; a change after that costs a tool swap and no plastic.
    const transitions = Math.max(0, Math.round(
      Math.max(0, num(layers)) * Math.min(1, Math.max(0, num(interleave))) * (used - 1),
    ));
    return {
      mode: mode.id,
      used,
      changes: transitions,
      manualChanges: 0,
      purgeEvents: used,
      purgeVolume: used * Math.max(0, num(primePerSpoolMm3)),
      machineSeconds: transitions * perChange,
      changeSeconds: perChange,
      basis: `${used} heads, each primed once at the start — after that a change is a `
        + `tool swap: ${transitions} of them at ${perChange} s, and no plastic`,
    };
  }

  // One hotend fed from several spools: every layer with a transition purges.
  const transitions = Math.max(0, Math.round(
    Math.max(0, num(layers)) * Math.min(1, Math.max(0, num(interleave))) * (used - 1),
  ));
  return {
    mode: mode.id,
    used,
    changes: transitions,
    manualChanges: 0,
    purgeEvents: transitions,
    purgeVolume: transitions * Math.max(0, num(purgePerChangeMm3)),
    machineSeconds: transitions * perChange,
    changeSeconds: perChange,
    basis: `one hotend and ${used} colours, so it purges on every layer that changes — `
      + `about ${transitions} purges at ${perChange} s each (assuming `
      + `${(interleave * 100).toFixed(0)}% of the ${Math.max(0, Math.round(num(layers)))} `
      + 'layers have a transition)',
  };
}
