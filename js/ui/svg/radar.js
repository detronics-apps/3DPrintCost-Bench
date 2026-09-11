/**
 * The print-type radar: a polygon showing how a profile scores on Speed, Cost,
 * Strength, Precision and Aesthetics. A HIGHER score is always better for the
 * customer, so a Cost of 5 is the cheapest — the further a corner reaches, the
 * better that quality is. The scores are CALCULATED from the profile's settings
 * (see scores.js), so this is a true picture of what the profile does.
 *
 * Every colour is a token so the drawing survives being exported (pitfalls #7).
 */

import { svg } from '../dom.js';
import { num } from '../../money.js';
import { SCORE_AXES } from '../../scores.js';

const text = (x, y, value, attrs = {}) => svg('text', {
  x, y, 'font-size': 11, fill: 'var(--text-dim)', 'font-family': 'inherit', ...attrs,
}, [String(value)]);

/** Evenly space the axes around the circle, first one straight up. */
function layoutFor(axes) {
  const n = axes.length;
  return axes.map((a, i) => {
    const theta = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    return {
      id: a.id,
      name: a.name,
      ux,
      uy,
      anchor: ux > 0.15 ? 'start' : (ux < -0.15 ? 'end' : 'middle'),
      dy: uy < -0.3 ? -6 : (uy > 0.3 ? 13 : 4),
    };
  });
}

export function radarChart(ratings, { size = 200, max = 5, title = null, axes = SCORE_AXES } = {}) {
  const layout = layoutFor(axes);
  const pad = 40;
  const R = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Extra room left and right so the side labels ("Aesthetics", "Cost") are never
  // clipped. The viewBox is widened; the pentagon stays centred.
  const hpad = 44;
  const root = svg('svg', {
    viewBox: `${-hpad} 0 ${size + hpad * 2} ${size}`,
    role: 'img',
    'aria-label': title || `How this print type scores on ${axes.map((a) => a.name.toLowerCase()).join(', ')}`,
  });

  const pt = (axis, v) => ({
    x: cx + axis.ux * (v / max) * R,
    y: cy + axis.uy * (v / max) * R,
  });
  const ring = (v) => `${layout.map((a, i) => {
    const p = pt(a, v);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ')} Z`;

  for (let lvl = 1; lvl <= max; lvl += 1) {
    root.appendChild(svg('path', {
      d: ring(lvl), fill: 'none', stroke: 'var(--border)', 'stroke-width': lvl === max ? 1.2 : 0.6,
    }));
  }
  for (const a of layout) {
    const p = pt(a, max);
    root.appendChild(svg('line', {
      x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: 'var(--border)', 'stroke-width': 0.6,
    }));
  }

  const vals = ratings || {};
  const poly = `${layout.map((a, i) => {
    const v = Math.max(0, Math.min(max, num(vals[a.id], 0)));
    const p = pt(a, v);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ')} Z`;
  root.appendChild(svg('path', {
    d: poly,
    fill: 'var(--accent-soft)', 'fill-opacity': 0.55,
    stroke: 'var(--accent-strong)', 'stroke-width': 2, 'stroke-linejoin': 'round',
  }));

  for (const a of layout) {
    const p = pt(a, max);
    root.appendChild(text(p.x + a.ux * 2, p.y + a.dy, a.name, {
      'text-anchor': a.anchor, fill: 'var(--text)', 'font-weight': '600',
    }));
  }
  return root;
}
