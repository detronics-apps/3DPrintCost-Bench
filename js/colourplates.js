/**
 * Splitting a bed into colour-compatible plates. Pure.
 *
 * A machine holds only so many spools at once - its slot limit (four, on an
 * AMS). Colours are chosen PER PART: one part might want red and blue, another
 * green, black and white. What can share a plate is decided by the UNION of the
 * colours on it, because a colour loaded once serves every part that uses it -
 * so two parts that both use black cost one black slot between them, not two.
 *
 * When the parts due together need more DISTINCT colours than the machine holds,
 * they cannot all print on one plate, and the bed is split across plates, each
 * within the limit. Packing shared colours together means fewer plates, which is
 * the whole point: fewer plates is less changeover and a shorter job.
 *
 * A part that on its own asks for more colours than the machine can hold is
 * impossible as a single print. That is a mistake to surface, not to hide, so it
 * comes back in `overflow` rather than being forced onto a plate.
 */

import { num } from './money.js';

const distinct = (list) => [...new Set((list || []).filter((c) => c != null && c !== ''))];

/**
 * Group parts onto colour-compatible plates.
 *
 *   parts:      [{ id, colours: [colourKey, ...] }]
 *   slotLimit:  how many spools the machine holds at once
 *
 * Returns { slotLimit, plates:[{ colours:[...], parts:[id...] }], overflow:[id...],
 *           plateCount, splits } where `splits` is how many EXTRA plates the
 * colour limit forced (0 when everything fits on one).
 */
export function splitByColour(parts, slotLimit) {
  const limit = Math.max(1, Math.round(num(slotLimit, 1)));
  const items = (parts || []).map((p) => ({ id: p.id, colours: distinct(p.colours) }));

  const overflow = items.filter((p) => p.colours.length > limit).map((p) => p.id);
  const placeable = items.filter((p) => p.colours.length <= limit && p.colours.length > 0);
  const colourless = items.filter((p) => p.colours.length === 0).map((p) => p.id);

  // First-fit-decreasing: the most colourful parts are hardest to place, so they
  // go first, each onto the first plate whose colour union still fits it.
  const ordered = [...placeable].sort((a, b) => b.colours.length - a.colours.length
    || String(a.id).localeCompare(String(b.id)));
  const plates = [];

  for (const part of ordered) {
    let placed = false;
    for (const plate of plates) {
      const union = new Set([...plate.colours, ...part.colours]);
      if (union.size <= limit) {
        plate.colours = [...union];
        plate.parts.push(part.id);
        placed = true;
        break;
      }
    }
    if (!placed) plates.push({ colours: [...part.colours], parts: [part.id] });
  }

  // Parts with no colour of their own ride on the first plate if there is one,
  // or a bare plate otherwise - they never force a split.
  if (colourless.length) {
    if (!plates.length) plates.push({ colours: [], parts: [] });
    plates[0].parts.push(...colourless);
  }

  const ordered_out = plates.map((p) => ({ colours: p.colours.slice().sort(), parts: p.parts }));
  return {
    slotLimit: limit,
    plates: ordered_out,
    overflow,
    plateCount: ordered_out.length,
    /** Extra plates the colour limit forced, beyond a single bed. */
    splits: Math.max(0, ordered_out.length - 1),
  };
}
