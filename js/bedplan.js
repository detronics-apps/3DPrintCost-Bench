/**
 * Arranging several DIFFERENT parts on the bed, with positions. Pure.
 *
 * `bedpacking.js` answers "how many plates and which parts on each" from a cost
 * model; it does not place anything. This module takes the oriented footprints of
 * the parts and lays them out with actual x/y positions (and carries their height
 * for the 3-D view), spilling onto more plates as each fills, so the bed can be
 * DRAWN — the operator sees "this part here, ten of those there, on this plate".
 *
 * It is a guillotine free-rectangle packer, largest footprint first: each plate
 * keeps a list of empty rectangles; a part drops into the smallest one it fits and
 * splits it into the strip to its right and the strip below. This fills the space
 * beside a tall part (a shelf packer wastes it), so parts are not pushed onto an
 * extra plate they did not need. Like `partsPerPlate` and `packBed` it is a floor,
 * not a nesting promise — a person laying the plate out in a slicer knows better.
 * It is for the picture, and it says so.
 *
 * A multi-colour print needs a purge tower: pass `reserve` (its footprint) and a
 * strip along the back of every plate is kept clear for it, and reported so both
 * the top view and the isometric view can draw it.
 */

import { num } from './money.js';
import { plateLayout } from './geometry.js';

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

  // Placements are offset down by the tower strip, so parts never sit under it.
  const yOffset = stripH;

  // A SINGLE part type is drawn as the EXACT grid `partsPerPlate`/`plateLayout`
  // counts — the same number the estimate and the recorded prints use, tower and
  // all. Reusing that one calculation (rather than a second packer here) is what
  // keeps the picture, the estimate and the record in step, and it cannot spill a
  // row off the plate because the positions come from the fit itself. Mixed part
  // types fall through to the guillotine packer below.
  const positive = (items || []).filter((it) => Math.max(0, Math.round(num(it.count, 0))) > 0);
  if (positive.length === 1) {
    const it = positive[0];
    const total = Math.max(0, Math.round(num(it.count, 0)));
    const reservedArea = reserve ? Math.max(0, num(reserve.x)) * Math.max(0, num(reserve.y)) : 0;
    const gl = plateLayout(it.size, build, { gap, margin, reservedArea });
    const capacity = Math.max(0, gl.count);
    if (!gl.fits || capacity < 1) {
      return { plates: [], plateCount: 0, area, reserve: reserveRect, overflow: [it.id] };
    }
    // Honour a "parts per plate" override (passed as it.perPlate) but never draw
    // more than physically fit — so the picture can never overflow the plate.
    const per = Math.min(capacity, Math.max(1, Math.round(num(it.perPlate, capacity))));
    const materials = Array.isArray(it.materials) ? it.materials.filter(Boolean) : [];
    const uz = Math.max(0, num(it.size?.z));
    // plateLayout gives build-absolute positions (with the margin); this view works
    // margin-relative, so shift them back by the margin.
    const toPlacement = (pos) => ({
      id: it.id, label: it.label, colour: it.colour || null, materials, z: uz,
      x: pos.x - margin, y: pos.y - margin, w: pos.w, h: pos.d,
    });
    const grid = [];
    let placed = 0;
    while (placed < total) {
      const n = Math.min(per, total - placed);
      grid.push({ w, h, placements: gl.positions.slice(0, n).map(toPlacement) });
      placed += n;
    }
    const tower = gl.tower
      ? { x: gl.tower.x - margin, y: gl.tower.y - margin, w: gl.tower.w, h: gl.tower.d }
      : reserveRect;
    return { plates: grid, plateCount: grid.length, area, reserve: tower, overflow: [] };
  }

  const units = [];
  const overflow = new Set();
  for (const it of items || []) {
    const uw = Math.max(0, num(it.size?.x));
    const uh = Math.max(0, num(it.size?.y));
    const uz = Math.max(0, num(it.size?.z));
    const n = Math.max(0, Math.round(num(it.count, 0)));
    const materials = Array.isArray(it.materials) ? it.materials.filter(Boolean) : [];
    // A part that fits in NEITHER orientation overflows; otherwise it packs, and
    // the placer below chooses whichever way round fits.
    const fitsSomehow = (uw <= w && uh <= packH) || (uh <= w && uw <= packH);
    if (n > 0 && (!fitsSomehow || w <= 0 || packH <= 0)) overflow.add(it.id);
    else for (let i = 0; i < n; i += 1) units.push({ id: it.id, label: it.label, colour: it.colour || null, w: uw, h: uh, z: uz, materials });
  }
  units.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const plates = [];
  const freshPlate = () => {
    // Each plate starts as one free rectangle: the whole usable area below the strip.
    const p = { w, h, placements: [], free: [{ x: 0, y: yOffset, w, h: packH }] };
    plates.push(p);
    return p;
  };

  // Place a unit into the smallest free rect on a plate that fits it, then guillotine
  // that rect into the strip to the right (full height) and the strip below (used
  // width). Returns true if it landed.
  const placeOn = (p, u) => {
    // Try the part both ways round on the bed — a 90° spin on the plate is the
    // same print — and drop it into the tightest free rectangle that takes it,
    // in whichever orientation. This is the same freedom the grid estimate uses,
    // so the drawn layout packs as densely as the estimate counts.
    let best = -1;
    let bestRot = false;
    let bestArea = Infinity;
    for (const rot of [false, true]) {
      const uw = rot ? u.h : u.w;
      const uh = rot ? u.w : u.h;
      for (let i = 0; i < p.free.length; i += 1) {
        const r = p.free[i];
        if (uw <= r.w + 1e-9 && uh <= r.h + 1e-9 && r.w * r.h < bestArea) {
          best = i; bestRot = rot; bestArea = r.w * r.h;
        }
      }
    }
    if (best < 0) return false;
    const r = p.free[best];
    const uw = bestRot ? u.h : u.w;
    const uh = bestRot ? u.w : u.h;
    p.placements.push({ ...u, w: uw, h: uh, x: r.x, y: r.y });
    const usedW = uw + gap;
    const usedH = uh + gap;
    const right = { x: r.x + usedW, y: r.y, w: r.w - usedW, h: r.h };
    const below = { x: r.x, y: r.y + usedH, w: usedW, h: r.h - usedH };
    p.free.splice(best, 1);
    if (right.w > 1e-6 && right.h > 1e-6) p.free.push(right);
    if (below.w > 1e-6 && below.h > 1e-6) p.free.push(below);
    return true;
  };

  for (const u of units) {
    let placed = false;
    for (const p of plates) {
      if (placeOn(p, u)) { placed = true; break; }
    }
    if (!placed) placeOn(freshPlate(), u);
  }

  return {
    plates: plates.map((p) => ({ w: p.w, h: p.h, placements: p.placements })),
    plateCount: plates.length,
    area,
    reserve: reserveRect,
    overflow: [...overflow],
  };
}
