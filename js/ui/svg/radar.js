/**
 * The print-type radar: a four-axis diamond showing how a profile scores on
 * Speed, Cost, Strength and Precision. A HIGHER score is always better for the
 * customer, so a Cost of 5 is the cheapest — the further a corner reaches, the
 * better that quality is. The scores are the profile's editable ratings, so this
 * is the company's own picture, not a fixed one.
 *
 * Every colour is a token so the drawing survives being exported (pitfalls #7).
 */

import { svg } from '../dom.js';
import { num } from '../../money.js';

const text = (x, y, value, attrs = {}) => svg('text', {
  x, y, 'font-size': 11, fill: 'var(--text-dim)', 'font-family': 'inherit', ...attrs,
}, [String(value)]);

/** Axes clockwise from the top: Speed up, Cost right, Precision down, Strength left. */
const LAYOUT = [
  { id: 'speed', name: 'Speed', ux: 0, uy: -1, anchor: 'middle', dy: -6 },
  { id: 'cost', name: 'Cost', ux: 1, uy: 0, anchor: 'start', dy: 4 },
  { id: 'precision', name: 'Precision', ux: 0, uy: 1, anchor: 'middle', dy: 15 },
  { id: 'strength', name: 'Strength', ux: -1, uy: 0, anchor: 'end', dy: 4 },
];

export function radarChart(ratings, { size = 190, max = 5, title = null } = {}) {
  const pad = 34;
  const R = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const root = svg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label': title || 'How this print type scores on speed, cost, strength and precision',
  });

  const pt = (axis, v) => ({
    x: cx + axis.ux * (v / max) * R,
    y: cy + axis.uy * (v / max) * R,
  });
  const ring = (v) => `${LAYOUT.map((a, i) => {
    const p = pt(a, v);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ')} Z`;

  for (let lvl = 1; lvl <= max; lvl += 1) {
    root.appendChild(svg('path', {
      d: ring(lvl), fill: 'none', stroke: 'var(--border)', 'stroke-width': lvl === max ? 1.2 : 0.6,
    }));
  }
  for (const a of LAYOUT) {
    const p = pt(a, max);
    root.appendChild(svg('line', {
      x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: 'var(--border)', 'stroke-width': 0.6,
    }));
  }

  const vals = ratings || {};
  const poly = `${LAYOUT.map((a, i) => {
    const v = Math.max(0, Math.min(max, num(vals[a.id], 0)));
    const p = pt(a, v);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ')} Z`;
  root.appendChild(svg('path', {
    d: poly,
    fill: 'var(--accent-soft)', 'fill-opacity': 0.55,
    stroke: 'var(--accent-strong)', 'stroke-width': 2, 'stroke-linejoin': 'round',
  }));

  for (const a of LAYOUT) {
    const p = pt(a, max);
    root.appendChild(text(p.x + a.ux * 2, p.y + a.dy, a.name, {
      'text-anchor': a.anchor, fill: 'var(--text)', 'font-weight': '600',
    }));
  }
  return root;
}
