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

function topSvg(plate, area, reserve, { colourById }) {
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
    const fill = p.colour || colourById(p.id);
    node.appendChild(svg('rect', { x, y, width: w, height: h, rx: 2, fill, 'fill-opacity': 0.55, stroke: fill, 'stroke-width': 1 }));
    if (w > 22 && h > 12) {
      node.appendChild(svg('text', {
        x: x + w / 2, y: y + h / 2, 'font-size': 9, fill: 'var(--text)', 'font-family': 'inherit',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, [String(p.label || '')]));
    }
  }
  return node;
}

/* ----------------------------------------------------------- iso view -- */

const AX = Math.cos(Math.PI / 6);
const AY = Math.sin(Math.PI / 6);

// A single box (a part) drawn as three faces, shaded from one fill.
function isoBox(cx, cy, s, { x, y, w, d, z }, fill, label) {
  const P = (px, py, pz) => ({ sx: cx + (px - py) * AX * s, sy: cy - (px + py) * AY * s - pz * s });
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
  const g = svg('g', {}, [
    poly([c.b, c.d0, c.D, c.B], fill, 0.5), // right face
    poly([c.e, c.d0, c.D, c.E], fill, 0.35), // front face
    poly([c.A, c.B, c.D, c.E], fill, 0.8), // top face
  ]);
  if (label && w * s > 26) {
    const mid = P(x + w / 2, y + d / 2, zTop);
    g.appendChild(svg('text', {
      x: mid.sx, y: mid.sy, 'font-size': 8, fill: 'var(--text)', 'font-family': 'inherit',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    }, [label]));
  }
  return g;
}

function isoSvg(plate, area, reserve, build, { colourById, printerName }) {
  const W = 400;
  const H = 300;
  const bx = area.w;
  const by = area.h;
  const bz = Math.max(1, Number(build?.z) || Math.max(bx, by));
  // Scale so the whole cage fits.
  const spanX = (bx + by) * AX;
  const spanY = (bx + by) * AY + bz;
  const s = Math.min((W - 40) / Math.max(1, spanX), (H - 40) / Math.max(1, spanY)) * 0.92;
  const cx = W / 2 + (by - bx) * AX * s / 2;
  const cy = H - 24;
  const P = (px, py, pz) => ({ sx: cx + (px - py) * AX * s, sy: cy - (px + py) * AY * s - pz * s });

  const node = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bedplan__svg bedplan__iso', role: 'img', preserveAspectRatio: 'xMidYMid meet' });

  // The plate floor.
  const f = [P(0, 0, 0), P(bx, 0, 0), P(bx, by, 0), P(0, by, 0)];
  node.appendChild(svg('polygon', {
    points: f.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '),
    fill: 'var(--surface-2, #eef1f5)', stroke: 'var(--border)', 'stroke-width': 1,
  }));
  // The build-volume cage (back edges), so height reads.
  const cage = [[P(0, 0, 0), P(0, 0, bz)], [P(bx, 0, 0), P(bx, 0, bz)], [P(0, by, 0), P(0, by, bz)],
    [P(0, 0, bz), P(bx, 0, bz)], [P(0, 0, bz), P(0, by, bz)]];
  for (const [a, b] of cage) {
    node.appendChild(svg('line', {
      x1: a.sx, y1: a.sy, x2: b.sx, y2: b.sy, stroke: 'var(--border)', 'stroke-width': 0.75, 'stroke-dasharray': '3 3',
    }));
  }

  // Boxes back-to-front so nearer parts overlap farther ones correctly.
  const boxes = plate.placements.map((p) => ({ ...p, key: p.x + p.y }))
    .sort((a, b) => a.key - b.key);
  for (const p of boxes) {
    node.appendChild(isoBox(cx, cy, s, { x: p.x, y: p.y, w: p.w, d: p.h, z: p.z }, p.colour || colourById(p.id), p.label));
  }
  // The purge tower, tall and thin, in its reserved corner.
  if (reserve) {
    node.appendChild(isoBox(cx, cy, s, { x: reserve.x, y: reserve.y, w: reserve.w, d: reserve.h, z: bz * 0.6 }, TOWER_FILL, 'Purge'));
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
  const sel = Math.max(0, Math.min(selectedIndex, plan.plates.length - 1));

  const legend = el('div', { class: 'bedplan__legend' }, live.map((it) => el('span', { class: 'bedplan__key' }, [
    el('span', { class: 'bedplan__swatch', style: `background:${it.colour || colourById(it.id)}`, 'aria-hidden': 'true' }),
    el('span', { text: `${it.label} ×${Math.round(it.count)}` }),
  ])));

  const plates = plan.plates.map((plate, i) => {
    const fig = el('figure', { class: `bedplan__plate${i === sel ? ' is-selected' : ''}` }, [
      topSvg(plate, plan.area, plan.reserve, { colourById }),
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
    isoSvg(plan.plates[sel], plan.area, plan.reserve, build, { colourById, printerName }),
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
