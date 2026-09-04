/**
 * The part inside the build volume.
 *
 * An isometric cage for the machine and a solid block for the part, drawn to
 * one scale so "it does not fit" is visible rather than asserted. The part is
 * a bounding box, not the mesh: the app measures the real geometry but drawing
 * a mesh would need a renderer, and a box answers the question this picture is
 * asked - will it go in, and which way up.
 *
 * The projection is stated once, here, and everything reads it from this one
 * place. Two functions deciding independently which way is up is how a diagram
 * ends up disagreeing with the numbers beside it.
 */

import { svg } from '../dom.js';

/** The projection. x runs right-and-down, y runs left-and-down, z runs up. */
const ISO = {
  ax: Math.cos(Math.PI / 6),
  ay: Math.sin(Math.PI / 6),
};

const project = (x, y, z, scale, origin) => ({
  x: origin.x + (x - y) * ISO.ax * scale,
  y: origin.y - (x + y) * ISO.ay * scale - z * scale,
});

const W = 520;
const H = 312;
/** Exceeds the RENDERED height of an 11px line, which is about 15px - not 11.
 *  A stride shorter than the box moves a label by less than its own height and
 *  it still overlaps what it was avoiding (pitfalls #10). */
const CAPTION_STRIDE = 18;

const text = (x, y, value, attrs = {}) => svg('text', {
  x, y, 'font-size': 11, fill: 'var(--text-dim)', 'font-family': 'inherit', ...attrs,
}, [String(value)]);

function boxFaces(size, scale, origin) {
  const { x: sx, y: sy, z: sz } = size;
  const p = (x, y, z) => project(x, y, z, scale, origin);
  const c = {
    a: p(0, 0, 0), b: p(sx, 0, 0), c: p(sx, sy, 0), d: p(0, sy, 0),
    e: p(0, 0, sz), f: p(sx, 0, sz), g: p(sx, sy, sz), h: p(0, sy, sz),
  };
  const poly = (...points) => points.map((k) => `${c[k].x.toFixed(2)},${c[k].y.toFixed(2)}`).join(' ');
  return {
    corners: c,
    top: poly('e', 'f', 'g', 'h'),
    left: poly('a', 'b', 'f', 'e'),
    right: poly('b', 'c', 'g', 'f'),
    floor: poly('a', 'b', 'c', 'd'),
  };
}

/**
 * @param {object} spec
 * @param {{x:number,y:number,z:number}} spec.build the machine
 * @param {{x:number,y:number,z:number}} spec.part  the part, already oriented
 * @param {boolean} spec.fits
 */
export function partInBuildVolume({ build, part, fits, printerName, perPlate = 1 }) {
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `${printerName || 'Printer'} build volume with the part in it`,
  });

  const b = {
    x: Math.max(1, Number(build?.x) || 1),
    y: Math.max(1, Number(build?.y) || 1),
    z: Math.max(1, Number(build?.z) || 1),
  };
  const p = {
    x: Math.max(0.1, Number(part?.x) || 0.1),
    y: Math.max(0.1, Number(part?.y) || 0.1),
    z: Math.max(0.1, Number(part?.z) || 0.1),
  };

  // The scale has to hold whichever is bigger, or an oversized part is drawn
  // outside the viewBox and simply vanishes from an export (pitfalls #4).
  const span = {
    x: Math.max(b.x, p.x), y: Math.max(b.y, p.y), z: Math.max(b.z, p.z),
  };
  const widthUnits = (span.x + span.y) * ISO.ax;
  const heightUnits = (span.x + span.y) * ISO.ay + span.z;
  const captionBlock = CAPTION_STRIDE * 2 + 10;
  const scale = Math.min((W - 130) / widthUnits, (H - 40 - captionBlock) / heightUnits);

  const origin = {
    x: 70 + span.y * ISO.ax * scale,
    y: H - captionBlock,
  };

  const cage = boxFaces(b, scale, origin);
  const solid = boxFaces(p, scale, origin);

  // The plate first, then the part, then the cage's front edges over the top.
  root.appendChild(svg('polygon', {
    points: cage.floor, fill: 'var(--panel-3)', stroke: 'var(--border)', 'stroke-width': 1,
  }));

  const partFill = fits ? 'var(--accent)' : 'var(--danger)';
  for (const [face, shade] of [['left', 0.82], ['right', 0.66], ['top', 1]]) {
    root.appendChild(svg('polygon', {
      points: solid[face],
      fill: partFill,
      'fill-opacity': shade,
      stroke: 'var(--panel)',
      'stroke-width': 1,
    }));
  }

  root.appendChild(svg('polygon', {
    points: cage.top, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
  }));
  for (const key of ['a', 'b', 'c', 'd']) {
    const top = { a: 'e', b: 'f', c: 'g', d: 'h' }[key];
    root.appendChild(svg('line', {
      x1: cage.corners[key].x, y1: cage.corners[key].y,
      x2: cage.corners[top].x, y2: cage.corners[top].y,
      stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    }));
  }

  /* Captions run full width under the drawing, where there is room to grow -
     never hung off the side of the box, where a long name runs off the canvas. */
  const one = (v) => Number(v).toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '');
  root.appendChild(text(4, 16, `${printerName || 'Printer'} · build ${one(b.x)} × ${one(b.y)} × ${one(b.z)} mm`, {
    fill: 'var(--text)', 'font-weight': '600',
  }));
  root.appendChild(text(4, H - CAPTION_STRIDE - 4, `Part ${one(p.x)} × ${one(p.y)} × ${one(p.z)} mm`, {
    fill: fits ? 'var(--text)' : 'var(--danger)', 'font-weight': '600',
  }));
  root.appendChild(text(4, H - 4, fits
    ? `${perPlate} on a plate`
    : 'Too big for this machine in every orientation', {
    fill: fits ? 'var(--text-faint)' : 'var(--danger)',
  }));

  return root;
}

/** One box, offset to a position on the plate, projected. */
function boxAt(ox, oy, w, d, h, scale, origin) {
  const pr = (x, y, z) => project(ox + x, oy + y, z, scale, origin);
  const c = {
    a: pr(0, 0, 0), b: pr(w, 0, 0), c: pr(w, d, 0), d: pr(0, d, 0),
    e: pr(0, 0, h), f: pr(w, 0, h), g: pr(w, d, h), h: pr(0, d, h),
  };
  const poly = (...ks) => ks.map((k) => `${c[k].x.toFixed(2)},${c[k].y.toFixed(2)}`).join(' ');
  return { top: poly('e', 'f', 'g', 'h'), left: poly('a', 'b', 'f', 'e'), right: poly('b', 'c', 'g', 'f') };
}

/**
 * The bed AND the parts on it, in one isometric picture.
 *
 * The two views merged: the build-volume cage that says "will it fit and how
 * tall", and the plate layout that says "where do they go and how many". Every
 * part from `plateLayout` is drawn as a little block standing on the floor at
 * its own place, back-to-front so the front ones sit over the ones behind. The
 * purge tower stands with them, dashed.
 */
export function plateInBuildVolume({ build, layout, size, fits = true, printerName }) {
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `${printerName || 'Printer'} bed with ${layout?.count || 0} parts standing on it`,
  });

  const b = {
    x: Math.max(1, Number(build?.x) || 1),
    y: Math.max(1, Number(build?.y) || 1),
    z: Math.max(1, Number(build?.z) || 1),
  };
  const partH = Math.max(0.1, Number(size?.z) || 0.1);
  const span = { x: b.x, y: b.y, z: Math.max(b.z, partH) };
  const widthUnits = (span.x + span.y) * ISO.ax;
  const heightUnits = (span.x + span.y) * ISO.ay + span.z;
  const captionBlock = CAPTION_STRIDE * 2 + 10;
  const scale = Math.min((W - 130) / widthUnits, (H - 40 - captionBlock) / heightUnits);
  const origin = { x: 70 + span.y * ISO.ax * scale, y: H - captionBlock };

  const cage = boxFaces(b, scale, origin);

  // The floor first, then everything standing on it, then the cage edges on top.
  root.appendChild(svg('polygon', {
    points: cage.floor, fill: 'var(--panel-3)', stroke: 'var(--border)', 'stroke-width': 1,
  }));

  // Back-to-front: the block with the largest x+y is deepest, so it is drawn
  // first and the nearer ones paint over it.
  const items = [
    ...(layout?.positions || []).map((p) => ({ ...p, kind: 'part' })),
    ...(layout?.tower ? [{ ...layout.tower, kind: 'tower' }] : []),
  ].sort((m, n) => (n.x + n.y) - (m.x + m.y));

  for (const it of items) {
    const box = boxAt(it.x, it.y, it.w, it.d, partH, scale, origin);
    if (it.kind === 'tower') {
      for (const face of ['left', 'right', 'top']) {
        root.appendChild(svg('polygon', {
          points: box[face], fill: 'var(--panel-2)', 'fill-opacity': 0.9,
          stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 2',
        }));
      }
    } else {
      const fill = fits ? 'var(--accent)' : 'var(--danger)';
      for (const [face, shade] of [['left', 0.82], ['right', 0.66], ['top', 1]]) {
        root.appendChild(svg('polygon', {
          points: box[face], fill, 'fill-opacity': shade, stroke: 'var(--panel)', 'stroke-width': 1,
        }));
      }
    }
  }

  root.appendChild(svg('polygon', {
    points: cage.top, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
  }));
  for (const key of ['a', 'b', 'c', 'd']) {
    const top = { a: 'e', b: 'f', c: 'g', d: 'h' }[key];
    root.appendChild(svg('line', {
      x1: cage.corners[key].x, y1: cage.corners[key].y,
      x2: cage.corners[top].x, y2: cage.corners[top].y,
      stroke: 'var(--border-strong)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
    }));
  }

  const one = (v) => Number(v).toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '');
  root.appendChild(text(4, 16, `${printerName || 'Printer'} · build ${one(b.x)} × ${one(b.y)} × ${one(b.z)} mm`, {
    fill: 'var(--text)', 'font-weight': '600',
  }));
  root.appendChild(text(4, H - CAPTION_STRIDE - 4,
    `Part ${one(size?.x || 0)} × ${one(size?.y || 0)} × ${one(partH)} mm`, {
      fill: fits ? 'var(--text)' : 'var(--danger)', 'font-weight': '600',
    }));
  const count = layout?.count || 0;
  const capacity = layout?.capacity || count;
  root.appendChild(text(4, H - 4, fits
    ? `${count} on this plate${capacity > count ? ` (${capacity} fit)` : ''}`
      + `${layout?.tower ? ' · purge tower alongside' : ''}`
    : 'Too big for this machine in every orientation', {
    fill: fits ? 'var(--text-faint)' : 'var(--danger)',
  }));

  return root;
}

/**
 * The bed seen from above, with the parts laid out on it.
 *
 * Straight down, not isometric: this picture answers "where do they go and how
 * many fit", which a top-down grid shows plainly and a 3-D cage muddles. The
 * arrangement comes from `plateLayout` in geometry.js, so it is the same grid
 * the per-plate count is worked out from - the picture cannot disagree with the
 * number beside it.
 */
export function plateView({ layout, printerName, size }) {
  const VW = 520;
  const VH = 360;
  const pad = 20;
  const bx = Math.max(1, Number(layout?.build?.x) || 1);
  const by = Math.max(1, Number(layout?.build?.y) || 1);
  const scale = Math.min((VW - pad * 2) / bx, (VH - pad * 2 - 40) / by);
  const ox = (VW - bx * scale) / 2;
  const oy = 30;
  const px = (mm) => ox + mm * scale;
  const py = (mm) => oy + mm * scale;

  const root = svg('svg', {
    viewBox: `0 0 ${VW} ${VH}`,
    role: 'img',
    'aria-label': `${printerName || 'Printer'} bed with ${layout?.count || 0} parts laid out`,
  });

  root.appendChild(text(ox, 18, `${printerName || 'Printer'} — one plate, seen from above`,
    { fill: 'var(--text)' }));

  // The bed, and the printable area inside its margin.
  root.appendChild(svg('rect', {
    x: px(0), y: py(0), width: bx * scale, height: by * scale, rx: 4,
    fill: 'var(--panel-2)', stroke: 'var(--border-strong)', 'stroke-width': 1.2,
  }));
  const m = layout.margin || 0;
  root.appendChild(svg('rect', {
    x: px(m), y: py(m), width: (bx - 2 * m) * scale, height: (by - 2 * m) * scale,
    fill: 'none', stroke: 'var(--border)', 'stroke-dasharray': '4 3',
  }));

  for (const p of layout.positions || []) {
    root.appendChild(svg('rect', {
      x: px(p.x), y: py(p.y), width: p.w * scale, height: p.d * scale, rx: 2,
      fill: 'var(--accent-soft)', stroke: 'var(--accent-strong)', 'stroke-width': 1,
    }));
  }

  if (layout.tower) {
    const t = layout.tower;
    root.appendChild(svg('rect', {
      x: px(t.x), y: py(t.y), width: t.w * scale, height: t.d * scale, rx: 2,
      fill: 'var(--panel-3)', stroke: 'var(--text-faint)', 'stroke-dasharray': '3 2',
    }));
    root.appendChild(text(px(t.x) + 2, py(t.y) + 9, 'purge', { 'font-size': 8, fill: 'var(--text-faint)' }));
  }

  const foot = `${layout.count || 0} per plate · bed ${Math.round(bx)}×${Math.round(by)} mm`
    + (size ? ` · part ${Math.round(size.x)}×${Math.round(size.y)} mm` : '');
  root.appendChild(text(ox, VH - 8, foot, { fill: 'var(--text-faint)' }));

  return root;
}

/**
 * The six orientations, ranked by height.
 *
 * Height drives print time far harder than footprint does, so this is the
 * cheapest saving in the app and it deserves to be visible.
 */
export function orientationChart({ options, chosenIndex = 0 }) {
  const rowH = 26;
  const height = 24 + options.length * rowH + 8;
  const width = 420;
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Print height in each orientation',
  });

  const maxHeight = Math.max(...options.map((o) => o.height), 1e-9);
  const barLeft = 92;
  const barWidth = width - barLeft - 62;

  root.appendChild(text(0, 12, 'Print height by orientation (lower is faster)', {
    fill: 'var(--text)', 'font-weight': '600',
  }));

  options.forEach((option, i) => {
    const y = 24 + i * rowH;
    const w = (option.height / maxHeight) * barWidth;
    const chosen = i === chosenIndex;
    root.appendChild(text(barLeft - 8, y + 14, `${option.up} up`, {
      'text-anchor': 'end', fill: chosen ? 'var(--text)' : 'var(--text-faint)',
      'font-weight': chosen ? '600' : '400',
    }));
    root.appendChild(svg('rect', {
      x: barLeft, y: y + 4, width: Math.max(1, w), height: 14, rx: 3,
      fill: chosen ? 'var(--accent-strong)' : 'var(--panel-3)',
      stroke: chosen ? 'none' : 'var(--border)',
    }));
    root.appendChild(text(barLeft + Math.max(1, w) + 8, y + 15, `${option.height.toFixed(1)} mm`, {
      fill: 'var(--text-dim)', 'font-size': 10,
    }));
  });

  return root;
}
