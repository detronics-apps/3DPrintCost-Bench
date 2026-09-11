/**
 * Bed plans: several different parts positioned together on each plate, shown two
 * ways from ONE arrangement — a top-down plan and an isometric view of the SAME
 * models, so the two never disagree. A purge tower is drawn on both when the bed
 * runs more than one colour. Click a plate to select it; the isometric view shows
 * the selected plate.
 *
 * Positions come from `arrangeBed` (a shelf-packing floor, not a nesting promise);
 * this only draws them. Shared by the estimate, the project and the portal so the
 * picture is the same everywhere.
 */

import { svg, el } from '../dom.js';
import { arrangeBed } from '../../bedplan.js';

const PALETTE = [
  'var(--accent)', 'var(--ok)', 'var(--warn)', '#6b8cce',
  '#8e6bce', '#ce6b9f', '#6bcec1', '#b0a06b',
];

const TOWER_FILL = 'var(--text-dim)';
// A part that will not fit the machine (too tall for the build height) is drawn in
// this colour everywhere it appears, so the warning above the notes has a face.
const OVERFLOW_FILL = 'var(--danger)';

// Does a placed part fit the build height? (Footprint overflow is caught earlier and
// the part is never placed, so a placed part only fails by being too tall.)
function fitsHeight(p, buildZ) {
  return !buildZ || (Number(p.z) || 0) <= buildZ + 1e-6;
}

/**
 * Does THIS plate need a purge tower? A tower is only needed where a plate
 * actually runs more than one colour — a plate holding parts that all print in
 * one material never purges, even on a machine with several spools loaded. When
 * the parts carry no material info we fall back to the bed-wide decision.
 */
function plateNeedsTower(plate) {
  const set = new Set();
  let any = false;
  for (const p of plate.placements) {
    for (const m of (p.materials || [])) { set.add(m); any = true; }
  }
  return any ? set.size > 1 : true;
}

/**
 * The purge-tower footprint for a bed, or null. A tower is only needed when the
 * bed runs more than one colour (a single colour never purges), so this returns
 * the configured tower footprint when the loaded slots carry more than one
 * distinct material, else null.
 */
export function bedTowerFootprint(settings, slots) {
  const distinct = new Set((slots || []).map((s) => s?.materialId).filter(Boolean));
  if (distinct.size > 1) return settings?.estimate?.assumptions?.purgeTower || { x: 30, y: 30 };
  return null;
}

/* ------------------------------------------------------------- top view -- */

function topSvg(plate, area, reserve, { colourById, buildZ = 0, labelFor = null }) {
  const gutter = 8;
  const scale = Math.min(360 / Math.max(1, area.w), 240 / Math.max(1, area.h));
  const W = area.w * scale + gutter * 2;
  const H = area.h * scale + gutter * 2;
  const node = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bedplan__svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  node.appendChild(svg('rect', {
    x: gutter, y: gutter, width: area.w * scale, height: area.h * scale,
    rx: 4, fill: 'var(--surface-2, #eef1f5)', stroke: 'var(--border)', 'stroke-width': 1,
  }));
  if (reserve) {
    node.appendChild(svg('rect', {
      x: gutter + reserve.x * scale, y: gutter + reserve.y * scale,
      width: Math.max(2, reserve.w * scale), height: Math.max(2, reserve.h * scale),
      rx: 2, fill: TOWER_FILL, 'fill-opacity': 0.3, stroke: TOWER_FILL, 'stroke-width': 1, 'stroke-dasharray': '3 2',
    }));
    if (reserve.w * scale > 26) {
      node.appendChild(svg('text', {
        x: gutter + (reserve.x + reserve.w / 2) * scale, y: gutter + (reserve.y + reserve.h / 2) * scale,
        'font-size': 8, fill: 'var(--text-dim)', 'font-family': 'inherit', 'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, ['Purge']));
    }
  }
  for (const p of plate.placements) {
    const x = gutter + p.x * scale;
    const y = gutter + p.y * scale;
    const w = Math.max(2, p.w * scale);
    const h = Math.max(2, p.h * scale);
    const bad = !fitsHeight(p, buildZ);
    const fill = bad ? OVERFLOW_FILL : (p.colour || colourById(p.id));
    node.appendChild(svg('rect', {
      x, y, width: w, height: h, rx: 2, fill, 'fill-opacity': bad ? 0.7 : 0.55,
      stroke: fill, 'stroke-width': bad ? 1.5 : 1,
    }));
    const label = labelFor ? labelFor(p.id) : String(p.label || '');
    if (label && w > 22 && h > 12) {
      node.appendChild(svg('text', {
        x: x + w / 2, y: y + h / 2, 'font-size': 9, fill: bad ? 'var(--danger)' : 'var(--text)', 'font-family': 'inherit',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, [label]));
    }
  }
  return node;
}

/* ----------------------------------------------------------- iso view -- */

const AX = Math.cos(Math.PI / 6);
const AY = Math.sin(Math.PI / 6);

// A single box (a part) drawn as three faces, shaded from one fill. `P` is the
// shared isometric projection so every box and the cage agree. No text — the
// isometric view shows the coloured blocks only; names live on the top view.
function isoBox(P, { x, y, w, d, z }, fill) {
  const zTop = Math.max(z, 1);
  const c = {
    // base corners
    a: P(x, y, 0), b: P(x + w, y, 0), d0: P(x + w, y + d, 0), e: P(x, y + d, 0),
    // top corners
    A: P(x, y, zTop), B: P(x + w, y, zTop), D: P(x + w, y + d, zTop), E: P(x, y + d, zTop),
  };
  const poly = (pts, f, op) => svg('polygon', {
    points: pts.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
    fill: f, 'fill-opacity': op, stroke: fill, 'stroke-width': 0.5, 'stroke-opacity': 0.6,
  });
  // The viewer looks down onto the front corner (a/A), so the visible faces are the
  // two that meet at that near edge — the −y face (front-right) and the −x face
  // (front-left) — plus the top. Drawing the far faces showed the box inside-out.
  return svg('g', {}, [
    poly([c.a, c.b, c.B, c.A], fill, 0.5), // front-right face (−y)
    poly([c.a, c.e, c.E, c.A], fill, 0.35), // front-left face (−x)
    poly([c.A, c.B, c.D, c.E], fill, 0.8), // top face
  ]);
}

// Rotate a rect 90° counter-clockwise within an `aw`-wide area, so the purge
// tower (back-left in the top view) lands on the LEFT of the isometric view.
function rot90(r, aw) {
  return { ...r, x: r.y, y: aw - (r.x + r.w), w: r.h, h: r.w };
}

function isoSvg(plate, area, reserve, build, { colourById, printerName, showTower }) {
  const W = 400;
  const H = 300;
  // The iso view is the top view rotated 90° CCW: swap the build footprint and
  // rotate every placement, so the same models read from the rotated viewpoint.
  const bx = area.h;
  const by = area.w;
  const placements = plate.placements.map((p) => ({ ...p, ...rot90(p, area.w) }));
  const towerRect = showTower && reserve ? rot90(reserve, area.w) : null;

  // The cage is always the real printer build volume, so a part that is too tall
  // for the machine visibly pokes out past the dashed lines (and is drawn red).
  const cageZ = Math.max(1, Number(build?.z) || Math.max(bx, by));
  const maxPartZ = Math.max(1, ...placements.map((p) => Number(p.z) || 0));
  // The purge tower matches the tallest printable part, never above the build height.
  const towerZ = Math.min(maxPartZ, cageZ);
  // Fit must include a part taller than the cage, so overflow is never clipped.
  const spanZ = Math.max(cageZ, maxPartZ);

  // Fit and centre the whole drawing in the frame. The projected bounding box is
  // (bx+by)·AX wide and (bx+by)·AY + spanZ tall; scale to fill, leaving room at the
  // top for the printer name, then place the origin so the box is centred.
  const topPad = printerName ? 26 : 14;
  const pad = 14;
  const widthUnit = (bx + by) * AX;
  const heightUnit = (bx + by) * AY + spanZ;
  const s = Math.min((W - pad * 2) / Math.max(1, widthUnit), (H - topPad - pad) / Math.max(1, heightUnit));
  const cx = W / 2 + (by - bx) * AX * s / 2;
  const cy = topPad + (H - topPad - pad + heightUnit * s) / 2;
  const P = (px, py, pz) => ({ sx: cx + (px - py) * AX * s, sy: cy - (px + py) * AY * s - pz * s });

  const node = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bedplan__svg bedplan__iso', role: 'img', preserveAspectRatio: 'xMidYMid meet' });

  // The plate floor.
  const f = [P(0, 0, 0), P(bx, 0, 0), P(bx, by, 0), P(0, by, 0)];
  node.appendChild(svg('polygon', {
    points: f.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
    fill: 'var(--surface-2, #eef1f5)', stroke: 'var(--border)', 'stroke-width': 1,
  }));
  // The cage (back edges) drawn to the real build height, so a too-tall part rises
  // above it.
  const cage = [[P(0, 0, 0), P(0, 0, cageZ)], [P(bx, 0, 0), P(bx, 0, cageZ)], [P(0, by, 0), P(0, by, cageZ)],
    [P(0, 0, cageZ), P(bx, 0, cageZ)], [P(0, 0, cageZ), P(0, by, cageZ)]];
  for (const [a, b] of cage) {
    node.appendChild(svg('line', {
      x1: a.sx, y1: a.sy, x2: b.sx, y2: b.sy, stroke: 'var(--border)', 'stroke-width': 0.75, 'stroke-dasharray': '3 3',
    }));
  }

  // Farthest parts first, so nearer parts paint over the ones behind them. A part
  // too tall for the build height is drawn red, matching the warning above the notes.
  const boxes = placements.map((p) => ({ ...p, key: p.x + p.y })).sort((a, b) => b.key - a.key);
  for (const p of boxes) {
    const fill = fitsHeight(p, cageZ) ? (p.colour || colourById(p.id)) : OVERFLOW_FILL;
    node.appendChild(isoBox(P, { x: p.x, y: p.y, w: p.w, d: p.h, z: p.z }, fill));
  }
  // The purge tower, thin and as tall as the tallest part, in its reserved corner.
  if (towerRect) {
    node.appendChild(isoBox(P, { x: towerRect.x, y: towerRect.y, w: towerRect.w, d: towerRect.h, z: towerZ }, TOWER_FILL));
  }
  if (printerName) {
    node.appendChild(svg('text', { x: W / 2, y: 14, 'font-size': 11, fill: 'var(--text-dim)', 'font-family': 'inherit', 'text-anchor': 'middle' }, [printerName]));
  }
  return node;
}

/* -------------------------------------------------------------- public -- */

/**
 * @param {Array<{id,label,colour?,size:{x,y,z?},count}>} items
 * @param {{x,y,z?}} build
 * @param {object} [opts]
 *   - `tower`: {x,y} purge-tower footprint when the bed is multi-colour, else null
 *   - `printerName`: shown on the isometric view
 *   - `selectedIndex` / `onSelectBed(i)`: click-to-select a plate for the iso view
 * @returns {HTMLElement|null}
 */
export function bedPlan(items, build, { gap = 8, margin = 10, tower = null, printerName = '', selectedIndex = 0, onSelectBed = null } = {}) {
  const live = (items || []).filter((it) => Math.max(0, Math.round(it.count || 0)) > 0);
  if (!live.length || !build || !build.x) return null;

  const plan = arrangeBed(live, build, { gap, margin, reserve: tower });
  const ids = [...new Set(live.map((it) => it.id))];
  const colourFor = new Map(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  const colourById = (id) => colourFor.get(id) || 'var(--accent)';
  // Boxes are labelled by position ("Part 1", "Part 2") — a full model file name
  // overflows the little rectangles and swamps the picture. The full name stays in
  // the legend.
  const shortLabelFor = (id) => `Part ${ids.indexOf(id) + 1}`;
  const sel = Math.max(0, Math.min(selectedIndex, plan.plates.length - 1));
  const buildZ = Math.max(0, Number(build.z) || 0);

  // Why a part will not fit — too big to lie on the bed at all (never placed), or
  // too tall for the build height (placed, but drawn red). Used to flag the legend.
  const overflowSet = new Set(plan.overflow);
  const unfitReason = (it) => {
    if (overflowSet.has(it.id)) return 'too big for the bed';
    if (buildZ && Number(it.size?.z || 0) > buildZ + 1e-6) return 'too tall';
    return null;
  };

  const legend = el('div', { class: 'bedplan__legend' }, live.map((it) => {
    const reason = unfitReason(it);
    // The legend carries the full name, led by the box's short label so the two link.
    const short = shortLabelFor(it.id);
    const name = it.label && it.label !== short ? `${short} — ${it.label}` : short;
    return el('span', { class: `bedplan__key${reason ? ' bedplan__key--over' : ''}` }, [
      el('span', {
        class: 'bedplan__swatch',
        style: `background:${reason ? 'var(--danger)' : (it.colour || colourById(it.id))}`,
        'aria-hidden': 'true',
      }),
      el('span', { text: `${name} ×${Math.round(it.count)}${reason ? ` — ${reason}` : ''}` }),
    ]);
  }));

  const towerOn = (plate) => (plan.reserve ? plateNeedsTower(plate) : false);

  const plates = plan.plates.map((plate, i) => {
    const fig = el('figure', { class: `bedplan__plate${i === sel ? ' is-selected' : ''}` }, [
      topSvg(plate, plan.area, towerOn(plate) ? plan.reserve : null, { colourById, buildZ, labelFor: shortLabelFor }),
      el('figcaption', { class: 'bedplan__cap', text: `Bed ${i + 1} — ${plate.placements.length} part${plate.placements.length === 1 ? '' : 's'}` }),
    ]);
    if (onSelectBed && plan.plates.length > 1) {
      fig.setAttribute('role', 'button');
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('aria-pressed', String(i === sel));
      fig.addEventListener('click', () => onSelectBed(i));
      fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectBed(i); } });
    }
    return fig;
  });

  const isoWrap = el('div', { class: 'bedplan__isowrap' }, [
    el('div', { class: 'bedplan__isohead', text: plan.plates.length > 1 ? `Bed ${sel + 1}, in 3-D` : 'In 3-D' }),
    isoSvg(plan.plates[sel], plan.area, plan.reserve, build, {
      colourById, printerName, showTower: towerOn(plan.plates[sel]),
    }),
  ]);

  const body = el('div', { class: 'bedplan__cols' }, [
    el('div', { class: 'bedplan__grid' }, plates),
    isoWrap,
  ]);

  const nodes = [legend, body];
  if (plan.overflow.length) {
    const names = plan.overflow.map((id) => live.find((it) => it.id === id)?.label || id);
    nodes.push(el('p', { class: 'muted', text: `Too big for this bed in this orientation: ${names.join(', ')}.` }));
  }
  nodes.push(el('p', { class: 'muted', text: 'An approximate layout — a shelf-packing floor, not a slicer nest. The top view and the 3-D view show the same parts.' }));
  return el('div', { class: 'bedplan' }, nodes);
}
