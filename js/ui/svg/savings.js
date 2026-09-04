/**
 * The "fill a plate and save" chart.
 *
 * A few bars - one part, a step or two, a full plate - each as tall as its
 * per-part price, so the drop is the message. The headline says the saving in
 * one number, because that is the bit a customer repeats to themselves.
 */

import { el, svg } from '../dom.js';
import { fmtMoney } from '../../money.js';

export function savingsChart(saving, code, { buffer = 0 } = {}) {
  const points = saving.points || [];
  if (points.length < 2 || saving.savingPercent <= 0) return null;

  const pad = 1 + Math.max(0, buffer);
  const money = (v) => fmtMoney(v * pad, code);
  const max = Math.max(...points.map((p) => p.unitPrice)) || 1;

  const W = 320;
  const H = 150;
  const left = 8;
  const right = 8;
  // Leave headroom above the tallest bar for its value label, which sits above
  // it — without this the label on a full-height bar is clipped at the top edge.
  const top = 24;
  const base = H - 26;
  const slot = (W - left - right) / points.length;
  const barW = Math.min(64, slot * 0.6);

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `Per-part price falls ${Math.round(saving.savingPercent * 100)} percent from one `
      + `part to a full plate of ${saving.plateQuantity}`,
    class: 'savings-chart',
    preserveAspectRatio: 'xMidYMid meet',
  });

  root.appendChild(svg('line', {
    x1: left, y1: base, x2: W - right, y2: base, stroke: 'var(--border)', 'stroke-width': 1,
  }));

  points.forEach((p, i) => {
    const cx = left + slot * i + slot / 2;
    const h = Math.max(3, (p.unitPrice / max) * (base - top));
    const y = base - h;
    const isPlate = p.quantity === saving.plateQuantity;
    const isOne = p.quantity === 1;
    root.appendChild(svg('rect', {
      x: cx - barW / 2, y, width: barW, height: h, rx: 3,
      fill: isPlate ? 'var(--accent-strong)' : 'var(--accent-soft)',
      stroke: isPlate ? 'var(--accent-strong)' : 'var(--border-strong)',
    }));
    root.appendChild(svg('text', {
      x: cx, y: y - 4, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--text)',
    }, [money(p.unitPrice)]));
    root.appendChild(svg('text', {
      x: cx, y: base + 12, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--text-faint)',
    }, [isOne ? '1 part' : isPlate ? `full plate (${p.quantity})` : `${p.quantity}`]));
  });

  return el('div', { class: 'savings' }, [
    el('div', { class: 'savings__headline' }, [
      el('strong', { text: `Save ${Math.round(saving.savingPercent * 100)}% each ` }),
      el('span', { class: 'muted', text: `by printing a full plate of ${saving.plateQuantity}` }),
    ]),
    el('div', { class: 'viewport__stage' }, [root]),
    el('div', { class: 'savings__note muted', text: `Each of these is about ${money(saving.one)} on its `
      + `own, but ${money(saving.platePrice)} each once the plate is full — the setup, admin and plate `
      + 'are shared across every part on it.' }),
  ]);
}
