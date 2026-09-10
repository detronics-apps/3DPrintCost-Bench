/**
 * Top-down bed plans: several different parts positioned together on each plate.
 *
 * A flat plan is the honest, legible way to show "this part here, ten of those
 * there" for a mixed bed — an isometric block per part would hide the small ones
 * behind the tall ones. Positions come from `arrangeBed` (a shelf-packing floor,
 * not a nesting promise); this only draws them. Shared by the estimate, the
 * project and the portal so the picture is the same everywhere.
 */

import { svg, el } from '../dom.js';
import { arrangeBed } from '../../bedplan.js';

// A categorical fill per distinct part, so different shapes are told apart at a
// glance. Values are the app's chart tokens; a part's own colour overrides it
// when one is supplied.
const PALETTE = [
  'var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--info, #6b8cce)',
  '#8e6bce', '#ce6b9f', '#6bcec1', '#b0a06b',
];

function plateSvg(plate, area, { colourById, gutter = 8 }) {
  const scale = Math.min(360 / Math.max(1, area.w), 240 / Math.max(1, area.h));
  const W = area.w * scale + gutter * 2;
  const H = area.h * scale + gutter * 2;
  const node = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'bedplan__svg',
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
  // The bed outline.
  node.appendChild(svg('rect', {
    x: gutter, y: gutter, width: area.w * scale, height: area.h * scale,
    rx: 4, fill: 'var(--surface-2, #eef1f5)', stroke: 'var(--border)', 'stroke-width': 1,
  }));
  for (const p of plate.placements) {
    const x = gutter + p.x * scale;
    const y = gutter + p.y * scale;
    const w = Math.max(2, p.w * scale);
    const h = Math.max(2, p.h * scale);
    const fill = p.colour || colourById(p.id);
    node.appendChild(svg('rect', {
      x, y, width: w, height: h, rx: 2,
      fill, 'fill-opacity': 0.55, stroke: fill, 'stroke-width': 1,
    }));
    // Only label when the footprint is big enough to hold a glyph, so a plate of
    // tiny parts is not a wall of overlapping text.
    if (w > 22 && h > 12) {
      node.appendChild(svg('text', {
        x: x + w / 2, y: y + h / 2,
        'font-size': 9, fill: 'var(--text)', 'font-family': 'inherit',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, [String(p.label || '')]));
    }
  }
  return node;
}

/**
 * Build the bed-plan view for a set of parts on one printer's build area.
 *
 * @param {Array<{id,label,colour?,size:{x,y},count}>} items
 * @param {{x,y}} build
 * @param {object} [opts] — `gap`/`margin` for the packer, `caption` per plate.
 * @returns {HTMLElement} a container with one small-multiple plate per bed, a
 *   legend, and any overflow note; or `null` when there is nothing to draw.
 */
export function bedPlan(items, build, { gap = 8, margin = 10 } = {}) {
  const live = (items || []).filter((it) => Math.max(0, Math.round(it.count || 0)) > 0);
  if (!live.length || !build || !build.x) return null;

  const plan = arrangeBed(live, build, { gap, margin });
  const ids = [...new Set(live.map((it) => it.id))];
  const colourFor = new Map(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  const colourById = (id) => colourFor.get(id) || 'var(--accent)';

  const legend = el('div', { class: 'bedplan__legend' }, live.map((it) => el('span', { class: 'bedplan__key' }, [
    el('span', {
      class: 'bedplan__swatch',
      style: `background:${it.colour || colourById(it.id)}`,
      'aria-hidden': 'true',
    }),
    el('span', { text: `${it.label} ×${Math.round(it.count)}` }),
  ])));

  const plates = plan.plates.map((plate, i) => el('figure', { class: 'bedplan__plate' }, [
    plateSvg(plate, plan.area, { colourById, gutter: 8 }),
    el('figcaption', { class: 'bedplan__cap', text: `Bed ${i + 1} — ${plate.placements.length} part${plate.placements.length === 1 ? '' : 's'}` }),
  ]));

  const nodes = [
    legend,
    el('div', { class: 'bedplan__grid' }, plates),
  ];
  if (plan.overflow.length) {
    const names = plan.overflow.map((id) => live.find((it) => it.id === id)?.label || id);
    nodes.push(el('p', { class: 'muted', text: `Too big for this bed in this orientation: ${names.join(', ')}.` }));
  }
  nodes.push(el('p', { class: 'muted', text: 'An approximate layout — a shelf-packing floor, not a slicer nest. It shows which parts share each plate and roughly where.' }));
  return el('div', { class: 'bedplan' }, nodes);
}
