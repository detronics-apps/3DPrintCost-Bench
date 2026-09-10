/**
 * Arranging several DIFFERENT parts on the bed, with positions. Pure.
 *
 * `bedpacking.js` answers "how many plates and which parts on each" from a cost
 * model; it does not place anything. This module takes the oriented footprints of
 * the parts and lays them out with actual x/y positions, spilling onto more plates
 * as each fills, so the bed can be DRAWN — the operator sees "this part here, ten
 * of those there, on this plate".
 *
 * It is a shelf (row) packer, largest footprint first: the standard cheap layout
 * heuristic. Like `partsPerPlate` and `packBed` it is a floor, not a nesting
 * promise — a person laying the plate out in a slicer knows better. It is for the
 * picture, and it says so.
 */

import { num } from './money.js';

/**
 * @param {Array<{id, label, colour?, size:{x,y}, count}>} items  oriented footprints
 * @param {{x,y}} build  the printer's build area
 * @param {object} [opts]
 * @returns {{ plates: Array<{ w, h, placements: Array<{id,label,colour,x,y,w,h}> }>,
 *             plateCount, area:{w,h}, overflow: string[] }}
 */
export function arrangeBed(items, build, { gap = 8, margin = 10 } = {}) {
  const w = Math.max(0, num(build?.x) - margin * 2);
  const h = Math.max(0, num(build?.y) - margin * 2);
  const area = { w, h };

  // Every unit of every part, largest footprint first, so awkward big parts are
  // placed while a plate still has room to choose.
  const units = [];
  const overflow = new Set();
  for (const it of items || []) {
    const uw = Math.max(0, num(it.size?.x));
    const uh = Math.max(0, num(it.size?.y));
    const n = Math.max(0, Math.round(num(it.count, 0)));
    // A part that cannot fit the bed even alone is flagged, not placed.
    if (n > 0 && (uw > w || uh > h || w <= 0 || h <= 0)) overflow.add(it.id);
    else for (let i = 0; i < n; i += 1) units.push({ id: it.id, label: it.label, colour: it.colour || null, w: uw, h: uh });
  }
  units.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const plates = [];
  const freshPlate = () => {
    const p = { w, h, placements: [], shelfY: 0, shelfH: 0, cursorX: 0 };
    plates.push(p);
    return p;
  };

  for (const u of units) {
    let placed = false;
    for (const p of plates) {
      // Try the current open shelf on this plate.
      if (p.cursorX + u.w <= w + 1e-9 && p.shelfY + Math.max(p.shelfH, u.h) <= h + 1e-9) {
        p.placements.push({ ...u, x: p.cursorX, y: p.shelfY });
        p.cursorX += u.w + gap;
        p.shelfH = Math.max(p.shelfH, u.h);
        placed = true;
        break;
      }
      // Start a new shelf on this plate.
      const nextY = p.shelfY + p.shelfH + gap;
      if (u.w <= w + 1e-9 && nextY + u.h <= h + 1e-9) {
        p.shelfY = nextY;
        p.cursorX = 0;
        p.shelfH = u.h;
        p.placements.push({ ...u, x: 0, y: p.shelfY });
        p.cursorX += u.w + gap;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const p = freshPlate();
      p.shelfH = u.h;
      p.placements.push({ ...u, x: 0, y: 0 });
      p.cursorX = u.w + gap;
    }
  }

  return {
    plates: plates.map((p) => ({ w: p.w, h: p.h, placements: p.placements })),
    plateCount: plates.length,
    area,
    overflow: [...overflow],
  };
}
