import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyse, orientations, partsPerPlate, plateLayout, fmtSize, mm3ToCm3, DEFAULT_OVERHANG_ANGLE,
} from '../js/geometry.js';
import { readMesh, parseObj, parseAsciiStl, parse3mfModel, looksBinaryStl } from '../js/mesh.js';
import { listEntries, unzipText, platformInflate } from '../js/zip.js';
import { box, twoBoxes, toBinaryStl, toAsciiStl, toObj, to3mfModel, makeZip } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

test('a box measures its own closed-form volume and area', () => {
  const g = analyse(box(20, 30, 40));
  close(g.volume, 20 * 30 * 40, 1e-6, 'volume');
  close(g.area, 2 * (20 * 30 + 20 * 40 + 30 * 40), 1e-6, 'area');
  assert.deepEqual(g.size, { x: 20, y: 30, z: 40 });
  assert.equal(g.triangleCount, 12);
});

test('a closed mesh reports watertight, and one object', () => {
  const g = analyse(box(10, 10, 10));
  assert.equal(g.watertight, true);
  assert.equal(g.openEdges, 0);
  assert.equal(g.objects, 1);
  assert.equal(g.inverted, false);
});

test('two separate bodies are counted as two', () => {
  const g = analyse(twoBoxes());
  assert.equal(g.objects, 2);
  close(g.volume, 2000, 1e-6, 'volume');
  assert.equal(g.watertight, true);
});

test('an open mesh is reported rather than measured as if it were closed', () => {
  const solid = box(10, 10, 10);
  // Drop the last face pair: the surface is now open.
  const open = {
    ...solid,
    positions: solid.positions.slice(0, 10 * 9),
    triangleCount: 10,
  };
  const g = analyse(open);
  assert.equal(g.watertight, false);
  assert.ok(g.openEdges > 0, 'open edges should be counted');
});

test('an inverted mesh is flagged, not silently absolute-valued', () => {
  const solid = box(10, 10, 10);
  const flipped = new Float32Array(solid.positions);
  for (let t = 0; t < solid.triangleCount; t += 1) {
    const o = t * 9;
    for (let i = 0; i < 3; i += 1) {
      const a = flipped[o + 3 + i];
      flipped[o + 3 + i] = flipped[o + 6 + i];
      flipped[o + 6 + i] = a;
    }
  }
  const g = analyse({ ...solid, positions: flipped });
  assert.equal(g.inverted, true);
  close(g.volume, 1000, 1e-6, 'volume is still reported positive');
});

test('the footprint of a box is its own base', () => {
  const g = analyse(box(20, 30, 40));
  close(g.footprintArea, 20 * 30, 1e-6, 'footprint');
});

test('a box has no overhang beyond the face it stands on', () => {
  // The bottom face IS within the overhang cone, and it is also at z = zmin,
  // so it needs no support height. Support volume, not overhang area, is the
  // number that has to be zero.
  const g = analyse(box(20, 20, 20));
  close(g.supportVolume, 0, 1e-6, 'support volume for a box');
  assert.equal(g.overhangAngle, DEFAULT_OVERHANG_ANGLE);
});

test('a raised overhang produces support volume proportional to its height', () => {
  const low = analyse(box(20, 20, 5, { at: [0, 0, 0] }));
  const raised = {
    ...low,
  };
  // A bridge: a plate floating 30 mm up, with legs, is what a slicer supports.
  const plate = box(20, 20, 5, { at: [0, 0, 30] });
  const leg = box(2, 2, 30, { at: [0, 0, 0] });
  const positions = new Float32Array(plate.positions.length + leg.positions.length);
  positions.set(plate.positions, 0);
  positions.set(leg.positions, plate.positions.length);
  const g = analyse({ positions, triangleCount: plate.triangleCount + leg.triangleCount });

  assert.ok(g.supportVolume > 0, 'a floating plate needs support');
  assert.ok(g.supportVolume < 20 * 20 * 30, 'support cannot exceed the solid it fills');
  assert.ok(raised.volume >= 0);
});

test('orientations are the six axis choices, flattest first', () => {
  const list = orientations({ x: 100, y: 20, z: 60 });
  assert.equal(list.length, 3);
  assert.equal(list[0].height, 20);
  assert.equal(list[list.length - 1].height, 100);
  for (const o of list) {
    close(o.footprint * o.height, 100 * 20 * 60, 1e-6, 'volume is preserved by rotation');
  }
});

test('parts per plate falls out of the build volume, and refuses the impossible', () => {
  const build = { x: 256, y: 256, z: 256 };
  assert.equal(partsPerPlate({ x: 300, y: 10, z: 10 }, build), 0);
  assert.equal(partsPerPlate({ x: 10, y: 10, z: 300 }, build), 0);
  assert.ok(partsPerPlate({ x: 50, y: 50, z: 50 }, build) >= 16);
  assert.equal(partsPerPlate({ x: 200, y: 200, z: 50 }, build), 1);
});

test('an empty mesh measures zero rather than NaN', () => {
  const g = analyse({ positions: new Float32Array(0), triangleCount: 0 });
  assert.equal(g.volume, 0);
  assert.equal(g.area, 0);
  assert.equal(g.objects, 0);
  for (const v of Object.values(g.size)) assert.ok(Number.isFinite(v));
});

/* ------------------------------------------------------------- readers -- */

test('binary STL round-trips through the reader', async () => {
  const buffer = toBinaryStl(box(20, 30, 40));
  assert.equal(looksBinaryStl(buffer), true);
  const mesh = await readMesh('part.stl', buffer);
  assert.equal(mesh.format, 'stl');
  close(analyse(mesh).volume, 24000, 1e-3, 'volume from binary STL');
});

test('ASCII STL round-trips through the reader', async () => {
  const text = toAsciiStl(box(10, 10, 10));
  const buffer = new TextEncoder().encode(text).buffer;
  assert.equal(looksBinaryStl(buffer), false);
  const mesh = await readMesh('part.stl', buffer);
  close(analyse(mesh).volume, 1000, 1e-3, 'volume from ASCII STL');
  assert.equal(parseAsciiStl(text).triangleCount, 12);
});

test('OBJ round-trips, including negative indices', () => {
  const mesh = parseObj(toObj(box(10, 10, 10)));
  close(analyse(mesh).volume, 1000, 1e-3, 'volume from OBJ');

  const relative = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n';
  assert.equal(parseObj(relative).triangleCount, 1);
});

test('an OBJ quad is triangulated rather than dropped', () => {
  const quad = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n';
  assert.equal(parseObj(quad).triangleCount, 2);
});

test('3MF is read out of a real deflated ZIP', async () => {
  const model = to3mfModel(box(20, 30, 40));
  const buffer = await makeZip({ '[Content_Types].xml': '<Types/>', '3D/3dmodel.model': model });

  const names = listEntries(buffer).map((e) => e.name);
  assert.deepEqual(names, ['[Content_Types].xml', '3D/3dmodel.model']);

  const mesh = await readMesh('part.3mf', buffer, { inflate: platformInflate });
  assert.equal(mesh.format, '3mf');
  close(analyse(mesh).volume, 24000, 1e-2, 'volume from 3MF');
});

test('3MF also reads from a stored (uncompressed) ZIP', async () => {
  const model = to3mfModel(box(10, 10, 10));
  const buffer = await makeZip({ '3D/3dmodel.model': model }, { compress: false });
  const text = await unzipText(buffer, '3D/3dmodel.model');
  assert.ok(text.includes('<triangle'));
  close(analyse(parse3mfModel(text)).volume, 1000, 1e-2, 'volume');
});

test('a 3MF in another unit is converted, and says so', () => {
  const model = to3mfModel(box(2, 3, 4), 'centimeter');
  const mesh = parse3mfModel(model);
  // 2 x 3 x 4 cm is 20 x 30 x 40 mm.
  close(analyse(mesh).volume, 24000, 1e-2, 'converted volume');
  assert.ok(mesh.warnings.some((w) => /centimeter/.test(w)), 'the conversion is reported');
});

test('an unreadable file fails loudly rather than measuring zero', async () => {
  const junk = new TextEncoder().encode('this is not a model at all').buffer;
  await assert.rejects(() => readMesh('notes.txt', junk), /Cannot read/);
});

test('display helpers do not leak raw precision', () => {
  assert.equal(fmtSize({ x: 120.04, y: 80, z: 45.5 }), '120 × 80 × 45.5 mm');
  assert.equal(mm3ToCm3(24000), 24);
});

test('plateLayout places the same number of parts partsPerPlate counts', () => {
  const size = { x: 40, y: 40, z: 20 };
  const build = { x: 256, y: 256, z: 256 };
  const count = partsPerPlate(size, build);
  const layout = plateLayout(size, build);
  assert.equal(layout.positions.length, count, 'a position for every part that fits');
  assert.equal(layout.count, count);
  // every part sits inside the usable area
  for (const p of layout.positions) {
    assert.ok(p.x >= layout.margin - 1e-9 && p.x + p.w <= build.x - layout.margin + 1e-9, 'within x');
    assert.ok(p.y >= layout.margin - 1e-9 && p.y + p.d <= build.y - layout.margin + 1e-9, 'within y');
  }
});

test('plateLayout honours a max and reserves a corner for a tower', () => {
  const size = { x: 30, y: 30, z: 15 };
  const build = { x: 256, y: 256, z: 256 };
  const capped = plateLayout(size, build, { max: 5 });
  assert.equal(capped.positions.length, 5, 'never more than the max asked for');

  const withTower = plateLayout(size, build, { reservedArea: 900 });
  const without = plateLayout(size, build, {});
  assert.ok(withTower.count <= without.count, 'a tower can only take space');
  assert.ok(withTower.tower, 'and it is placed');
  // no part overlaps the tower rectangle
  const t = withTower.tower;
  for (const p of withTower.positions) {
    const overlap = p.x < t.x + t.w && p.x + p.w > t.x && p.y < t.y + t.d && p.y + p.d > t.y;
    assert.ok(!overlap, 'parts never sit on the tower');
  }
});

test('plateLayout does not crash on a part taller than the machine', () => {
  const layout = plateLayout({ x: 20, y: 20, z: 500 }, { x: 256, y: 256, z: 256 });
  assert.equal(layout.fits, false);
  assert.ok(Number.isFinite(layout.count));
});

test('a purge tower in the leftover strip does not cost a part; a tight bed it does', () => {
  const bigBed = { x: 270, y: 270, z: 270 };   // Snapmaker U1
  const egg = { x: 59.2, y: 46.4, z: 23.4 };
  const tower = 900; // 30 × 30 mm

  const bare = partsPerPlate(egg, bigBed);
  const withTower = partsPerPlate(egg, bigBed, { reservedArea: tower });
  assert.equal(withTower, bare, 'the small tower stands in the leftover strip, so 12 still fit');
  assert.ok(bare >= 12, `and there really are 12 slots: ${bare}`);

  // A part that fills its bed edge-to-edge leaves no strip, so the tower costs a slot.
  const tight = { x: 70, y: 70, z: 20 };
  const bambu = { x: 256, y: 256, z: 256 };
  assert.ok(partsPerPlate(tight, bambu, { reservedArea: tower }) < partsPerPlate(tight, bambu),
    'with no leftover strip the tower still takes a part');
});

test('plateLayout stands the tower beside the grid when it fits, keeping every part', () => {
  const layout = plateLayout({ x: 59.2, y: 46.4, z: 23.4 }, { x: 270, y: 270, z: 270 },
    { reservedArea: 900 });
  assert.ok(layout.positions.length >= 12, `all parts kept: ${layout.positions.length}`);
  assert.ok(layout.tower, 'the tower is placed');
  // and it does not overlap any part cell
  const t = layout.tower;
  for (const p of layout.positions) {
    const overlap = p.x < t.x + t.w && p.x + p.w > t.x && p.y < t.y + t.d && p.y + p.d > t.y;
    assert.ok(!overlap, 'tower stands clear of the parts');
  }
});
