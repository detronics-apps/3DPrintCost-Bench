/**
 * What is loaded in the machine, and how much of the part is each of it.
 *
 * The controls a machine gets are decided by the machine:
 *
 *   single         one spool, and no way to add another
 *   manual         a list of spools somebody swaps between, one at a time. Both
 *                  vary, and the wording says "swap" rather than "head" because
 *                  only one is ever loaded
 *   multicolour    add spools, colour varies, the plastic is shared - one
 *                  hotend has one temperature, so the plastic select appears
 *                  once, above the list
 *   multimaterial  add spools, both vary, so each slot picks its own plastic
 *
 * Written once and used by the estimator and by a project's part, so the two
 * cannot disagree about what a machine can do.
 */

import { el } from './dom.js';
import {
  section, subsection, numberField, selectField, button, buttonRow, banner, muted, pill, table,
} from './controls.js';
import { materialPicker } from './material-picker.js';
import { colourMode, slotLimit } from '../printers.js';
import {
  makeSlot, reconcileSlots, canAddSlot, normaliseMix, slotsUsed, mixWithSlotAdded,
  rebalanceMix,
} from '../filaments.js';
import {
  findMaterial, materialLabel, materialType, coloursForType, findByTypeAndColour,
} from '../materials.js';
import { fmtMoney, num } from '../money.js';

/**
 * The loaded-filament editor.
 *
 * @param {object} spec
 * @param {object} spec.printer      the machine, which decides what is offered
 * @param {Array}  spec.slots        what is loaded now
 * @param {Array}  spec.materials    the catalogue
 * @param {Function} spec.onSlots    given the new slot list
 * @param {string} spec.countryId
 * @param {string} spec.currencyCode
 */
export function filamentSlots({
  printer, slots, materials, onSlots, countryId, currencyCode, keyPrefix = 'plate',
  mix = null, onMix = null, showDetail = true,
}) {
  const mode = colourMode(printer);
  const limit = slotLimit(printer);
  const reconciled = reconcileSlots(slots, printer, materials);
  const live = reconciled.slots;

  const nodes = [
    el('div', { class: 'mode-line' }, [
      pill(mode.name, mode.materialsVary ? 'ok' : (mode.coloursVary ? 'info' : 'warn')),
      el('span', { class: 'mode-line__hint', text: mode.hint }),
    ]),
  ];

  for (const note of reconciled.notes) nodes.push(banner(note.level, note.text));

  const setSlot = (id, materialId) => {
    onSlots(live.map((s) => (s.id === id ? { ...s, materialId } : s)));
  };

  if (!mode.coloursVary) {
    // One spool. There is nothing to add, so there is no button to add it.
    nodes.push(...materialPicker({
      keyPrefix,
      materials,
      materialId: live[0]?.materialId,
      countryId,
      currencyCode,
      showDetail,
      onChange: (id) => setSlot(live[0].id, id),
    }).nodes);
    return nodes;
  }

  if (!mode.materialsVary) {
    // One hotend, so the plastic is chosen once for the whole machine and only
    // the colour varies per slot. Putting a plastic select on every slot would
    // offer a choice the machine cannot honour.
    const first = findMaterial(materials, live[0]?.materialId);
    const type = first?.type;
    const colours = coloursForType(materials, type);

    nodes.push(subsection('Plastic', [
      selectField(`${keyPrefix}-shared-type`, 'Loaded plastic',
        [...new Set(materials.filter((m) => !m.archived).map((m) => m.type))]
          .map((t) => ({ value: t, label: materialType(t).name })),
        type,
        (nextType) => {
          // Every slot moves together, keeping its colour where it can.
          onSlots(live.map((s) => {
            const m = findMaterial(materials, s.materialId);
            const keep = findByTypeAndColour(materials, nextType, m?.colour);
            const fallback = coloursForType(materials, nextType)[0];
            const swap = keep || findByTypeAndColour(materials, nextType, fallback);
            return swap ? { ...s, materialId: swap.id } : s;
          }));
        }),
    ], { hint: 'One hotend has one temperature, so every spool loaded here is the '
      + 'same plastic. Colours are chosen per spool below.' }));

    nodes.push(subsection('Loaded colours', live.map((slot, i) => {
      const material = findMaterial(materials, slot.materialId);
      return el('div', { class: 'slot-row' }, [
        el('span', { class: 'slot-row__index', text: String(i + 1) }),
        selectField(`${keyPrefix}-slot-${i}-colour`, `Slot ${i + 1}`,
          colours.map((c) => ({ value: c, label: c })),
          material?.colour,
          (colour) => {
            const hit = findByTypeAndColour(materials, type, colour);
            if (hit) setSlot(slot.id, hit.id);
          }),
        live.length > 1
          ? button('Unload', () => onSlots(live.filter((s) => s.id !== slot.id)),
            { key: `${keyPrefix}-unload-${i}` })
          : null,
      ]);
    })));
  } else {
    // Independent heads, or a list somebody swaps between. Either way each
    // entry picks its own plastic and its own colour.
    const unitLabel = mode.manual ? 'Spool' : 'Head';
    nodes.push(subsection(mode.manual ? 'Spools, in the order they go in' : 'Loaded filament',
      live.map((slot, i) => el('div', { class: 'slot-block' }, [
      el('div', { class: 'slot-block__head' }, [
        el('strong', { text: `${unitLabel} ${i + 1}` }),
        live.length > 1
          ? button('Unload', () => onSlots(live.filter((s) => s.id !== slot.id)),
            { key: `${keyPrefix}-unload-${i}` })
          : null,
      ]),
      ...materialPicker({
        keyPrefix: `${keyPrefix}-slot-${i}`,
        materials,
        materialId: slot.materialId,
        countryId,
        currencyCode,
        showDetail,
        onChange: (id) => setSlot(slot.id, id),
      }).nodes,
    ])), {
      hint: mode.manual
        ? 'Only one of these is in the machine at a time. The print pauses and '
          + 'somebody swaps to the next one.'
        : null,
    }));
  }

  const addLabel = mode.manual
    ? 'Add a colour to swap to'
    : (mode.materialsVary ? 'Load another head' : 'Load another colour');

  nodes.push(buttonRow([
    button(addLabel, () => {
      const from = findMaterial(materials, live[live.length - 1]?.materialId);
      const candidates = mode.materialsVary
        ? materials.filter((m) => !m.archived)
        : materials.filter((m) => !m.archived && m.type === from?.type);
      const used = new Set(live.map((s) => s.materialId));
      const next = candidates.find((m) => !used.has(m.id)) || candidates[0];
      const slot = makeSlot(next?.id);
      // Seed the new spool a real share, or loading it changes nothing.
      if (onMix) onMix(mixWithSlotAdded(mix, live, slot.id));
      onSlots([...live, slot]);
    }, { key: `${keyPrefix}-add-slot`, disabled: !canAddSlot(live, printer) }),
    el('span', {
      class: 'muted',
      // "Loaded" is wrong for a machine that only ever holds one: those spools
      // are swapped through, not loaded at once.
      text: mode.manual
        ? `${live.length} of ${limit} spools, swapped by hand`
        : `${live.length} of ${limit} loaded`,
    }),
  ]));

  return nodes;
}

/**
 * How much of this part is each loaded filament.
 *
 * Only shown when more than one spool is loaded, because with one spool the
 * answer is always 100% and a control that can only hold one value is noise.
 */
export function mixEditor({
  slots, materials, mix, onMix, keyPrefix = 'mix', partName = 'this part',
}) {
  if (!slots || slots.length < 2) return [];

  const normalised = normaliseMix(mix, slots);
  const typed = normalised.typed;
  const nodes = [];

  // Typing 90 into one of two spools puts 10 in the other, there and then.
  // With more than two the change waterfalls onto the next spool, and only what
  // that one cannot hold flows on to the one after.
  const setPercent = (slotId, percent) => onMix(rebalanceMix(mix, slots, slotId, percent));

  nodes.push(...slots.map((slot, i) => {
    const material = findMaterial(materials, slot.materialId);
    const entry = normalised.entries.find((e) => e.slotId === slot.id);
    return numberField(
      `${keyPrefix}-${i}`,
      materialLabel(material),
      Number((entry?.percent ?? 0).toFixed(2)),
      (v) => setPercent(slot.id, v),
      { min: 0, max: 100, step: 1, suffix: '%' },
    );
  }));

  // The total is shown whether or not it is right. It should always read 100%
  // now that the editor balances as you type, so if it ever does not, something
  // has gone in from a share link or an older file and the reader should see it.
  const off = Math.abs(typed - 100) > 0.05;
  nodes.push(el('div', { class: `mix-total${off ? ' is-off' : ''}` }, [
    el('span', { text: 'Total' }),
    el('strong', { class: 'value', text: `${typed.toFixed(1)}%` }),
  ]));

  if (off) {
    nodes.push(banner('warn',
      `That adds up to ${typed.toFixed(1)}%, not 100%. The price below is worked out `
      + 'in the proportion you typed; correct it if that is not what you meant.'));
    nodes.push(buttonRow([button('Even it out', () => {
      const each = 100 / slots.length;
      onMix(slots.map((s) => ({ slotId: s.id, percent: each })));
    }, { key: `${keyPrefix}-even` })]));
  }

  return [subsection(`How much of ${partName} is each`, nodes, {
    hint: 'By volume, not by weight — different plastics have different densities, '
      + 'and the app converts after it splits.',
  })];
}

/**
 * What each filament actually cost, for the breakdown panel.
 *
 * The weight is shown both ways: per part, and the total the whole order needs -
 * because "10.4 g of white" per part is not what you go to the shelf with; you
 * need the ten-parts total to know whether there is enough on the spool.
 */
export function filamentBreakdown(line, currencyCode) {
  if (!line.filaments || line.filaments.length < 2) return null;
  const qty = Math.max(1, Math.round(num(line.quantity, 1)));
  const totalG = line.filaments.reduce((t, f) => t + num(f.grams) * qty, 0);
  return el('div', {}, [
    table([
      { label: 'Filament', get: (f) => f.label },
      { label: 'Share', align: 'right', mono: true, get: (f) => `${f.percent.toFixed(1)}%` },
      { label: 'Each', align: 'right', mono: true, get: (f) => `${f.grams.toFixed(1)} g` },
      { label: `Total ×${qty}`, align: 'right', mono: true, get: (f) => `${(f.grams * qty).toFixed(1)} g` },
      {
        label: 'Per gram',
        align: 'right',
        mono: true,
        get: (f) => (f.perGram == null ? 'no price' : fmtMoney(f.perGram, currencyCode)),
      },
      { label: 'Cost each', align: 'right', mono: true, get: (f) => fmtMoney(f.cost, currencyCode) },
    ], line.filaments, { compact: true }),
    muted(`Total filament for ${qty} part${qty === 1 ? '' : 's'}: ${totalG.toFixed(1)} g`
      + ` — ${line.filaments.map((f) => `${(f.grams * qty).toFixed(1)} g ${f.label}`).join(' + ')}`),
  ]);
}
