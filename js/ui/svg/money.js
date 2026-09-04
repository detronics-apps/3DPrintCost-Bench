/**
 * The money diagram: three bars on ONE scale.
 *
 * This is the picture the whole specification asks for. Production builds up to
 * the Cost to Company; the rule of thirds turns that into a part price three
 * times as long; and the invoice adds packaging, shipping and tax on the end,
 * visibly OUTSIDE the thirds. Drawing all three against the same money scale is
 * what makes "shipping is not part of the part price" something the reader can
 * see rather than something a panel asserts.
 *
 * Every colour is a token. Nothing here resolves a colour itself, so the export
 * path can substitute computed values and the drawing survives leaving the
 * document (pitfalls #7).
 */

import { svg } from '../dom.js';
import { fmtMoney, num } from '../../money.js';

const W = 760;
const LEFT = 104;
const RIGHT = 96;
const BAR_H = 34;
const ROW_GAP = 24;
const TOP = 34;
/** A segment narrower than this cannot hold a label, so it does not get one. */
const LABEL_MIN = 52;
const LEGEND_COLS = 3;

/** Nine fills that stay distinguishable in both themes. */
const FILLS = [
  'var(--accent-strong)',
  'var(--accent)',
  'var(--accent-soft)',
  'var(--ok)',
  'var(--warn)',
  'var(--text-faint)',
  'var(--danger)',
  'var(--panel-3)',
  'var(--border-strong)',
];

const text = (x, y, value, attrs = {}) => svg('text', {
  x, y, 'font-size': 11, fill: 'var(--text-dim)', 'font-family': 'inherit', ...attrs,
}, [String(value)]);

/**
 * Three bars on ONE scale, each with its own key underneath it.
 *
 * It used to carry a single shared key for all three bars - fifteen swatches at
 * the bottom of the picture, and the reader matching colours back up to
 * segments by eye. That is real work, and it is work the drawing was asking of
 * the reader rather than doing for them.
 *
 * Each bar now carries only its own four to eight entries, directly beneath it,
 * with the amount on each. There is nothing to cross-reference: the key for the
 * Invoice bar sits under the Invoice bar and mentions nothing else.
 *
 * The one scale stays. Pie charts were the obvious alternative and they would
 * lose exactly the thing this picture exists to show - three pies of equal size
 * would say the three totals are equal, when the whole point is that the
 * invoice is four times the production cost and you can see it.
 *
 * @param {object} spec
 * @param {Array<{name:string,note?:string,rows:Array<{label:string,amount:number}>}>} spec.rows
 * @param {string} spec.currencyCode
 */
export function moneyDiagram({ rows, currencyCode, title = null }) {
  const bars = rows
    .map((row) => ({ ...row, rows: row.rows.filter((s) => Math.max(0, num(s.amount)) > 0) }))
    .filter((row) => row.rows.length > 0);
  const totals = bars.map((row) => row.rows.reduce((t, s) => t + Math.max(0, num(s.amount)), 0));
  const scale = Math.max(...totals, 1e-9);

  // One colour per distinct label across the whole diagram, so a segment that
  // appears in two bars is the same colour in both.
  const palette = new Map();
  for (const row of bars) {
    for (const segment of row.rows) {
      if (!palette.has(segment.label)) palette.set(segment.label, FILLS[palette.size % FILLS.length]);
    }
  }

  const KEY_LINE = 15;
  const keyRowsFor = (row) => Math.ceil(row.rows.length / LEGEND_COLS);
  const blockHeight = (row) => BAR_H + 8 + keyRowsFor(row) * KEY_LINE + ROW_GAP;

  const H = TOP + bars.reduce((t, row) => t + blockHeight(row), 0) + 4;
  const width = W - LEFT - RIGHT;
  const colWidth = width / LEGEND_COLS;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': title || 'Cost, price and invoice compared on one scale',
  });

  if (title) root.appendChild(text(0, 14, title, { 'font-size': 12, fill: 'var(--text)', 'font-weight': '600' }));

  let y = TOP;
  bars.forEach((row, index) => {
    const total = totals[index];

    // The row label is short and bounded, so hanging it off the left is safe -
    // anything of unpredictable length belongs under the bar instead.
    root.appendChild(text(LEFT - 10, y + BAR_H / 2 + 4, row.name, {
      'text-anchor': 'end', fill: 'var(--text)', 'font-weight': '600',
    }));
    if (row.note) {
      root.appendChild(text(LEFT - 10, y + BAR_H / 2 + 17, row.note, {
        'text-anchor': 'end', fill: 'var(--text-faint)', 'font-size': 9,
      }));
    }

    root.appendChild(svg('rect', {
      x: LEFT, y, width, height: BAR_H, rx: 5,
      fill: 'var(--panel-2)', stroke: 'var(--border)',
    }));

    let x = LEFT;
    for (const segment of row.rows) {
      const amount = Math.max(0, num(segment.amount));
      const w = (amount / scale) * width;
      const fill = palette.get(segment.label);

      const rect = svg('rect', { x, y, width: w, height: BAR_H, fill, stroke: 'var(--panel)', 'stroke-width': 1 });
      rect.appendChild(svg('title', {}, [`${segment.label}: ${fmtMoney(amount, currencyCode)}`]));
      root.appendChild(rect);

      if (w >= LABEL_MIN) {
        root.appendChild(text(x + w / 2, y + BAR_H / 2 + 4, fmtMoney(amount, currencyCode), {
          'text-anchor': 'middle',
          'font-size': 10,
          fill: 'var(--panel)',
          'font-weight': '600',
        }));
      }
      x += w;
    }

    root.appendChild(text(W - RIGHT + 8, y + BAR_H / 2 + 4, fmtMoney(total, currencyCode), {
      fill: 'var(--text)', 'font-weight': '600',
    }));

    // This bar's own key, immediately under it, in fixed columns. Nothing here
    // depends on how wide a segment happens to be, so nothing can collide.
    const keyTop = y + BAR_H + 8;
    row.rows.forEach((segment, i) => {
      const col = i % LEGEND_COLS;
      const line = Math.floor(i / LEGEND_COLS);
      const kx = LEFT + col * colWidth;
      const ky = keyTop + line * KEY_LINE + 8;
      root.appendChild(svg('rect', {
        x: kx, y: ky - 7, width: 9, height: 9, rx: 2, fill: palette.get(segment.label),
      }));
      root.appendChild(text(kx + 14, ky + 1,
        `${segment.label} ${fmtMoney(segment.amount, currencyCode)}`, { 'font-size': 9 }));
    });

    y += blockHeight(row);
  });

  return root;
}

/** Roughly how wide a string renders at a given font size. */
const textWidth = (value, size = 11) => String(value).length * size * 0.56;

/**
 * The rule of thirds on its own.
 *
 * The blocks are proportional, so how wide each one is depends entirely on the
 * numbers. That used to be safe when there were three roughly equal thirds; it
 * stopped being safe the moment labour became a fourth block that can dominate
 * the bar. A part that is nearly all labour squeezes the other three to a few
 * pixels each, and centred labels under them collide and run off the canvas
 * (pitfalls #10 and #4).
 *
 * So the label placement is chosen rather than assumed: labels sit under their
 * own block only while EVERY block is wide enough to hold one. Otherwise they
 * move to a legend, where nothing can collide however lopsided the numbers get.
 */
export function thirdsDiagram({ price, currencyCode }) {
  // Labour gets a block of its own when it is recovered beside the thirds
  // rather than inside them. Drawing it inside "Cost to Company" would show the
  // reader the opposite of what the app is doing.
  const labourOutside = num(price.labour) > 0;
  const parts = [
    {
      label: 'Cost to Company',
      amount: price.recovery,
      fill: 'var(--accent-strong)',
      note: labourOutside ? 'Material, machine, power' : 'What it cost to make',
    },
    labourOutside ? {
      label: 'Labour',
      amount: price.labour,
      fill: 'var(--warn)',
      note: price.labourOverflowed ? 'Over its share, so the tank grew' : 'The work',
    } : null,
    {
      label: labourOutside ? 'Growth' : 'Labour + growth',
      amount: price.commercial,
      fill: 'var(--accent)',
      note: 'Marketing, R&D, admin',
    },
    { label: 'Profit + capital', amount: price.profit, fill: 'var(--ok)', note: 'Half of the two above' },
  ].filter(Boolean);

  const total = parts.reduce((t, p) => t + Math.max(0, num(p.amount)), 0) || 1;
  const width = W - 8;
  const y = 26;
  const barHeight = 40;

  // Widths first, so the placement can be decided from what will actually be
  // drawn rather than from what the numbers are expected to look like.
  let cursor = 4;
  for (const part of parts) {
    part.width = (Math.max(0, num(part.amount)) / total) * width;
    part.x = cursor;
    cursor += part.width;
  }

  const fitsUnderBlocks = parts.every(
    (p) => p.width >= Math.max(textWidth(p.label), textWidth(p.note, 10)) + 8,
  );

  const legendRows = fitsUnderBlocks ? 0 : Math.ceil(parts.length / 2);
  const height = fitsUnderBlocks ? 108 : y + barHeight + 12 + legendRows * 16 + 6;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    role: 'img',
    'aria-label': 'The rule of thirds',
  });

  for (const part of parts) {
    root.appendChild(svg('rect', {
      x: part.x, y, width: part.width, height: barHeight, fill: part.fill, stroke: 'var(--panel)',
    }));
    // The amount goes inside its own block, and only when it fits inside it.
    const amount = fmtMoney(part.amount, currencyCode);
    if (part.width >= textWidth(amount, 12) + 12) {
      root.appendChild(text(part.x + part.width / 2, y + barHeight / 2 + 4, amount, {
        'text-anchor': 'middle', fill: 'var(--panel)', 'font-weight': '700', 'font-size': 12,
      }));
    }
    if (fitsUnderBlocks) {
      root.appendChild(text(part.x + part.width / 2, y + barHeight + 16, part.label, {
        'text-anchor': 'middle', fill: 'var(--text)', 'font-weight': '600',
      }));
      root.appendChild(text(part.x + part.width / 2, y + barHeight + 30, part.note, {
        'text-anchor': 'middle', 'font-size': 10, fill: 'var(--text-faint)',
      }));
    }
  }

  if (!fitsUnderBlocks) {
    // A legend in fixed columns: no label depends on how wide its block is, so
    // no two of them can ever meet however lopsided the split becomes.
    const colWidth = (W - 8) / 2;
    parts.forEach((part, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = 4 + col * colWidth;
      const ly = y + barHeight + 20 + row * 16;
      root.appendChild(svg('rect', { x: lx, y: ly - 8, width: 10, height: 10, rx: 2, fill: part.fill }));
      root.appendChild(text(lx + 16, ly + 1,
        `${part.label} — ${fmtMoney(part.amount, currencyCode)}`, { 'font-size': 10 }));
    });
  }

  const demand = num(price.demand, 1);
  const basis = price.labourOverflowed
    ? 'the work went over its third, so that tank is bigger'
    : 'cost to company × 3';
  root.appendChild(text(4, 16, demand === 1
    ? `One part: ${fmtMoney(price.price, currencyCode)} — ${basis}`
    : `One part: ${fmtMoney(price.price, currencyCode)} — ${basis}, demand ${demand.toFixed(2)}×`, {
    fill: 'var(--text)', 'font-weight': '600', 'font-size': 12,
  }));

  return root;
}
