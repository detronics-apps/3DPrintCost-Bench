/**
 * Geometry from a triangle soup. Pure.
 *
 * Everything in here is measurement, not estimation: the volume of a closed
 * mesh is exactly the signed-tetrahedron sum, and the app must not blur that
 * line. What the geometry CANNOT tell you - how much plastic a slicer will lay
 * down - lives in estimate.js and is labelled as an estimate throughout.
 *
 * The one judgement call is the support model, and it is flagged where it is
 * made rather than buried.
 */

const DEG = Math.PI / 180;

/** Support is needed where a face leans further than this from vertical. */
export const DEFAULT_OVERHANG_ANGLE = 45;

const EMPTY = {
  triangleCount: 0,
  volume: 0,
  area: 0,
  bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  size: { x: 0, y: 0, z: 0 },
  footprintArea: 0,
  overhangArea: 0,
  supportVolume: 0,
  objects: 0,
  watertight: false,
  openEdges: 0,
  inverted: false,
};

/**
 * Measure a mesh.
 *
 * `volume` is signed: a mesh whose faces all point inward comes back negative,
 * which is a real fault worth reporting rather than hiding behind an abs().
 */
export function analyse(mesh, { overhangAngle = DEFAULT_OVERHANG_ANGLE, countObjects = true } = {}) {
  const positions = mesh?.positions;
  const count = mesh?.triangleCount || 0;
  if (!positions || count === 0) return { ...EMPTY };

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  let volume6 = 0;
  let area2 = 0;

  // A face is an overhang when its normal points down and is within
  // `overhangAngle` of straight down.
  const overhangCos = Math.cos(overhangAngle * DEG);
  let footprintArea2 = 0;
  let overhangArea = 0;
  let supportVolume = 0;

  const down = [];

  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];

    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      if (x < min.x) min.x = x; if (x > max.x) max.x = x;
      if (y < min.y) min.y = y; if (y > max.y) max.y = y;
      if (z < min.z) min.z = z; if (z > max.z) max.z = z;
    }

    // Six times the signed volume of the tetrahedron on the origin.
    volume6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);

    // Twice the area vector: (b-a) x (c-a).
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twice = Math.hypot(nx, ny, nz);
    area2 += twice;

    if (nz < 0) {
      footprintArea2 += -nz;                    // projected area of a downward face
      if (twice > 0 && -nz / twice >= overhangCos) {
        const faceArea = twice / 2;
        overhangArea += faceArea;
        down.push({ projected: -nz / 2, zc: (az + bz + cz) / 3 });
      }
    }
  }

  const bbox = { min, max };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };

  // The support model, stated plainly: every overhanging face is assumed to be
  // held up from the build plate, at a fill density typical of tree supports.
  // That over-states supports on a part whose overhangs sit above other solid
  // geometry, which is why it is a separate, scalable line and not folded into
  // the part volume.
  const SUPPORT_DENSITY = 0.12;
  for (const face of down) supportVolume += face.projected * Math.max(0, face.zc - min.z) * SUPPORT_DENSITY;

  const shells = countObjects ? countShells(positions, count) : { objects: 1, openEdges: 0 };

  return {
    triangleCount: count,
    volume: Math.abs(volume6) / 6,
    signedVolume: volume6 / 6,
    inverted: volume6 < 0,
    area: area2 / 2,
    bbox,
    size,
    footprintArea: footprintArea2 / 2,
    overhangArea,
    supportVolume,
    supportDensity: SUPPORT_DENSITY,
    overhangAngle,
    objects: shells.objects,
    openEdges: shells.openEdges,
    watertight: shells.openEdges === 0,
    warnings: mesh.warnings || [],
    units: mesh.units || 'mm',
    format: mesh.format || null,
  };
}

/**
 * How many separate bodies, and is the surface closed?
 *
 * Vertices are welded on their rounded coordinates, because exporters write the
 * same corner with different last digits in different facets and an unwelded
 * mesh reports every triangle as its own object.
 */
function countShells(positions, count) {
  const key = (x, y, z) => `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
  const ids = new Map();
  const parent = [];

  const idFor = (k) => {
    let id = ids.get(k);
    if (id === undefined) { id = parent.length; ids.set(k, id); parent.push(id); }
    return id;
  };
  const find = (a) => { let x = a; while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const edges = new Map();
  const bump = (a, b) => {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    edges.set(k, (edges.get(k) || 0) + 1);
  };

  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const a = idFor(key(positions[o], positions[o + 1], positions[o + 2]));
    const b = idFor(key(positions[o + 3], positions[o + 4], positions[o + 5]));
    const c = idFor(key(positions[o + 6], positions[o + 7], positions[o + 8]));
    union(a, b); union(b, c);
    bump(a, b); bump(b, c); bump(c, a);
  }

  const roots = new Set();
  for (let i = 0; i < parent.length; i += 1) roots.add(find(i));

  let openEdges = 0;
  for (const shared of edges.values()) if (shared !== 2) openEdges += 1;

  return { objects: roots.size, openEdges };
}

/**
 * The six axis-aligned orientations, smallest height first.
 *
 * Height drives print time far harder than footprint does, so laying a part
 * down is usually the single biggest saving available - which is what the
 * "angle / orientation optimisation" profile flag is paying for.
 */
export function orientations(size) {
  const s = [size.x, size.y, size.z].map((v) => Math.max(0, Number(v) || 0));
  const axes = ['X', 'Y', 'Z'];
  const out = [];
  for (let up = 0; up < 3; up += 1) {
    const rest = [0, 1, 2].filter((i) => i !== up);
    out.push({
      up: axes[up],
      size: { x: s[rest[0]], y: s[rest[1]], z: s[up] },
      height: s[up],
      footprint: s[rest[0]] * s[rest[1]],
    });
  }
  return out.sort((a, b) => a.height - b.height);
}

/**
 * How many of these fit on one plate.
 *
 * A grid layout with a gap, which is what a person actually does. Real nesting
 * beats it, so this is a floor rather than a promise, and the user can override
 * it - saying "eleven" and being wrong is worse than saying "at least eight".
 */
/** The grid for one orientation: how many columns and rows of a×b fit. */
function gridFor(w, d, a, b, gap) {
  return {
    a,
    b,
    cols: Math.max(0, Math.floor((w + gap) / (a + gap))),
    rows: Math.max(0, Math.floor((d + gap) / (b + gap))),
  };
}

/** The better of the two orientations - the one that fits more parts. */
function bestGrid(w, d, sx, sy, gap) {
  const upright = gridFor(w, d, sx, sy, gap);
  const turned = gridFor(w, d, sy, sx, gap);
  return upright.cols * upright.rows >= turned.cols * turned.rows ? upright : turned;
}

/**
 * Can a square-ish tower stand in the space the grid leaves over, rather than
 * taking a whole part-slot? A part slot is large; a purge tower is small, so if
 * the columns do not reach the edge there is often a strip beside them wide
 * enough to hold the tower for free. Only when there is no such strip does the
 * tower actually cost a part.
 */
function towerFitsBeside(w, d, grid, gap, towerSide) {
  const usedW = grid.cols * grid.a + Math.max(0, grid.cols - 1) * gap;
  const usedD = grid.rows * grid.b + Math.max(0, grid.rows - 1) * gap;
  const rightStrip = w - usedW;
  const bottomStrip = d - usedD;
  return (rightStrip >= towerSide + gap && d >= towerSide)
    || (bottomStrip >= towerSide + gap && w >= towerSide);
}

export function partsPerPlate(size, build, { gap = 8, margin = 10, reservedArea = 0 } = {}) {
  const w = Math.max(0, (Number(build?.x) || 0) - margin * 2);
  const d = Math.max(0, (Number(build?.y) || 0) - margin * 2);
  const h = Number(build?.z) || 0;
  const sx = Math.max(0.001, Number(size?.x) || 0);
  const sy = Math.max(0.001, Number(size?.y) || 0);
  const sz = Number(size?.z) || 0;
  if (sz > h) return 0;

  const grid = bestGrid(w, d, sx, sy, gap);
  const count = grid.cols * grid.rows;

  // A purge tower only costs a part when it cannot stand in the leftover strip.
  // When it can, every slot is still a part; when it cannot, it takes as many
  // whole slots as it covers - half a slot holds no part.
  const reserved = Math.max(0, Number(reservedArea) || 0);
  if (reserved <= 0) return count;
  const towerSide = Math.sqrt(reserved);
  if (towerFitsBeside(w, d, grid, gap, towerSide)) return count;
  const slot = (grid.a + gap) * (grid.b + gap);
  return Math.max(0, count - Math.ceil(reserved / Math.max(1e-9, slot)));
}

/**
 * Where the parts actually sit on one plate.
 *
 * The same grid `partsPerPlate` counts, but with the co-ordinates, so it can be
 * drawn. It is the honest floor the count is: a plain grid with a gap, the
 * better of the two orientations, and a purge tower taking a corner. Real
 * slicer nesting will beat it, which is exactly why this is a picture of a
 * reasonable arrangement, not a promise of the arrangement.
 */
export function plateLayout(size, build, {
  gap = 8, margin = 10, reservedArea = 0, max = Infinity,
} = {}) {
  const w = Math.max(0, (Number(build?.x) || 0) - margin * 2);
  const d = Math.max(0, (Number(build?.y) || 0) - margin * 2);
  const sx = Math.max(0.001, Number(size?.x) || 0);
  const sy = Math.max(0.001, Number(size?.y) || 0);

  const grid = bestGrid(w, d, sx, sy, gap);
  const { a, b, cols, rows } = grid;

  const cells = cols * rows;
  const slot = (a + gap) * (b + gap);
  const side = Math.sqrt(Math.max(0, reservedArea));
  const towerBeside = reservedArea > 0 && cells > 0 && towerFitsBeside(w, d, grid, gap, side);
  const towerSlots = (reservedArea > 0 && cells > 0 && !towerBeside)
    ? Math.min(cells, Math.ceil(reservedArea / Math.max(1e-9, slot))) : 0;
  const capacity = Math.max(0, cells - towerSlots);
  const count = Math.max(0, Math.min(capacity, Math.round(Number(max) || capacity)));

  // When the tower takes cells, it takes them at the end of the grid so the
  // parts fill from the top-left and never overlap it.
  const reserved = new Set();
  for (let k = 0; k < towerSlots; k += 1) reserved.add(cells - 1 - k);

  const positions = [];
  for (let idx = 0; idx < cells && positions.length < count; idx += 1) {
    if (reserved.has(idx)) continue;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    positions.push({ x: margin + col * (a + gap), y: margin + row * (b + gap), w: a, d: b });
  }

  let tower = null;
  if (reservedArea > 0 && cells > 0) {
    if (towerBeside) {
      // In the leftover strip beside the grid - it costs no part.
      const usedW = cols * a + Math.max(0, cols - 1) * gap;
      const usedD = rows * b + Math.max(0, rows - 1) * gap;
      const rightStrip = w - usedW;
      tower = (rightStrip >= side + gap && d >= side)
        ? { x: margin + usedW + gap, y: margin, w: side, d: side }
        : { x: margin, y: margin + usedD + gap, w: side, d: side };
    } else if (towerSlots > 0) {
      const firstCell = cells - towerSlots;
      const col = firstCell % cols;
      const row = Math.floor(firstCell / cols);
      tower = {
        x: margin + col * (a + gap),
        y: margin + row * (b + gap),
        w: Math.max(1, Math.min(side, a)),
        d: Math.max(1, Math.min(side, b)),
      };
    }
  }

  return {
    build: { x: Number(build?.x) || 0, y: Number(build?.y) || 0 },
    margin,
    cols,
    rows,
    cellW: a,
    cellD: b,
    count,
    capacity,
    positions,
    tower,
    fits: (Number(size?.z) || 0) <= (Number(build?.z) || 0),
  };
}

/** A tidy `120 × 80 × 45 mm`. */
export function fmtSize(size, digits = 1) {
  const one = (v) => (Number(v) || 0).toFixed(digits).replace(/\.?0+$/, '');
  return `${one(size?.x)} × ${one(size?.y)} × ${one(size?.z)} mm`;
}

/** cm3 reads better than mm3 for anything you can hold. */
export const mm3ToCm3 = (v) => (Number(v) || 0) / 1000;
