/**
 * Arranging several DIFFERENT parts on the bed, with positions. Pure.
 *
 * `bedpacking.js` answers "how many plates and which parts on each" from a cost
 * model; it does not place anything. This module takes the oriented footprints of
 * the parts and lays them out with actual x/y positions (and carries their height
 * for the 3-D view), spilling onto more plates as each fills, so the bed can be
 * DRAWN — the operator sees "this part here, ten of those there, on this plate".
 *
 * It is a shelf (row) packer, largest footprint first: the standard cheap layout
 * heuristic. Like `partsPerPlate` and `packBed` it is a floor, not a nesting
 * promise — a person laying the plate out in a slicer knows better. It is for the
 * picture, and it says so.
 *
 * A multi-colour print needs a purge tower: pass `reserve` (its footprint) and a
 * strip along the back of every plate is kept clear for it, and reported so both
 * the top view and the isometric view can draw it.
 */

import { num } from './money.js';

/**
 * @param {Array<{id, label, colour?, size:{x,y,z?}, count}>} items  oriented footprints
 * @param {{x,y}} build  the printer's build area
 * @param {object} [opts]  gap, margin, and `reserve:{x,y}` for a purge tower
 * @returns {{ plates: Array<{ w, h, placements: Array<{id,label,colour,x,y,w,h,z}> }>,
 *             plateCount, area:{w,h}, reserve:{x,y,w,h}|null, overflow: string[] }}
 */
export function arrangeBed(items, build, { gap = 8, margin = 10, reserve = null } = {}) {
  const w = Math.max(0, num(build?.x) - margin * 2);
  const h = Math.max(0, num(build?.y) - margin * 2);
  const area = { w, h };

  // A purge tower sits in the back-left corner of every plate; parts pack in the
  // area below the strip it needs. Only drawn when `reserve` is given (multi-colour).
  const towerW = reserve ? Math.min(w, Math.max(0, num(reserve.x))) : 0;
  const towerH = reserve ? Math.min(h, Math.max(0, num(reserve.y))) : 0;
  const stripH = reserve ? towerH + gap : 0;
  const packH = Math.max(0, h - stripH);
  const reserveRect = reserve && towerW > 0 && towerH > 0 ? { x: 0, y: 0, w: towerW, h: towerH } : null;

  const units = [];
  const overflow = new Set();
  for (const it of items || []) {
    const uw = Math.max(0, num(it.size?.x));
    const uh = Math.max(0, num(it.size?.y));
    const uz = Math.max(0, num(it.size?.z));
    const n = Math.max(0, Math.round(num(it.count, 0)));
    const materials = Array.isArray(it.materials) ? it.materials.filter(Boolean) : [];
    if (n > 0 && (uw > w || uh > packH || w <= 0 || packH <= 0)) overflow.add(it.id);
    else for (let i = 0; i < n; i += 1) units.push({ id: it.id, label: it.label, colour: it.colour || null, w: uw, h: uh, z: uz, materials });
  }
  units.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const plates = [];
  const freshPlate = () => {
    const p = { w, h, placements: [], shelfY: 0, shelfH: 0, cursorX: 0 };
    plates.push(p);
    return p;
  };
  // Placements are offset down by the tower strip, so parts never sit under it.
  const yOffset = stripH;

  for (const u of units) {
    let placed = false;
    for (const p of plates) {
      if (p.cursorX + u.w <= w + 1e-9 && p.shelfY + Math.max(p.shelfH, u.h) <= packH + 1e-9) {
        p.placements.push({ ...u, x: p.cursorX, y: p.shelfY + yOffset });
        p.cursorX += u.w + gap;
        p.shelfH = Math.max(p.shelfH, u.h);
        placed = true;
        break;
      }
      const nextY = p.shelfY + p.shelfH + gap;
      if (u.w <= w + 1e-9 && nextY + u.h <= packH + 1e-9) {
        p.shelfY = nextY;
        p.cursorX = u.w + gap;
        p.shelfH = u.h;
        p.placements.push({ ...u, x: 0, y: nextY + yOffset });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const p = freshPlate();
      p.shelfH = u.h;
      p.placements.push({ ...u, x: 0, y: yOffset });
      p.cursorX = u.w + gap;
    }
  }

  return {
    plates: plates.map((p) => ({ w: p.w, h: p.h, placements: p.placements })),
    plateCount: plates.length,
    area,
    reserve: reserveRect,
    overflow: [...overflow],
  };
}
