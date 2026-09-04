/**
 * Test solids, generated rather than hand-placed.
 *
 * A hand-written triangle list has hairline faults that no assertion notices
 * until something downstream is wrong for a reason that looks unrelated. These
 * are walked from a definition, so every join is exact by construction and the
 * expected volume is known in closed form.
 */

/** An axis-aligned box with outward normals, at the origin. */
export function box(w, d, h, { at = [0, 0, 0] } = {}) {
  const [ox, oy, oz] = at;
  const v = [
    [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
    [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h],
  ];
  // Each face wound anticlockwise seen from outside.
  const faces = [
    [0, 3, 2], [0, 2, 1],        // bottom, normal -Z
    [4, 5, 6], [4, 6, 7],        // top, normal +Z
    [0, 1, 5], [0, 5, 4],        // front, -Y
    [2, 3, 7], [2, 7, 6],        // back, +Y
    [1, 2, 6], [1, 6, 5],        // right, +X
    [3, 0, 4], [3, 4, 7],        // left, -X
  ];
  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, t) => {
    face.forEach((index, c) => {
      positions[t * 9 + c * 3] = v[index][0];
      positions[t * 9 + c * 3 + 1] = v[index][1];
      positions[t * 9 + c * 3 + 2] = v[index][2];
    });
  });
  return { positions, triangleCount: faces.length, format: 'test', units: 'mm', warnings: [] };
}

/** Two boxes that do not touch, for the object-count check. */
export function twoBoxes() {
  const a = box(10, 10, 10);
  const b = box(10, 10, 10, { at: [40, 0, 0] });
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions, 0);
  positions.set(b.positions, a.positions.length);
  return {
    positions,
    triangleCount: a.triangleCount + b.triangleCount,
    format: 'test', units: 'mm', warnings: [],
  };
}

/** Binary STL bytes for a mesh, so the reader is tested against real bytes. */
export function toBinaryStl(mesh) {
  const buffer = new ArrayBuffer(84 + mesh.triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, mesh.triangleCount, true);
  let at = 84;
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    at += 12;                                   // normal left at zero on purpose
    for (let i = 0; i < 9; i += 1) {
      view.setFloat32(at, mesh.positions[t * 9 + i], true);
      at += 4;
    }
    at += 2;
  }
  return buffer;
}

export function toAsciiStl(mesh) {
  let out = 'solid test\n';
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    out += '  facet normal 0 0 0\n    outer loop\n';
    for (let c = 0; c < 3; c += 1) {
      const o = t * 9 + c * 3;
      out += `      vertex ${mesh.positions[o]} ${mesh.positions[o + 1]} ${mesh.positions[o + 2]}\n`;
    }
    out += '    endloop\n  endfacet\n';
  }
  return `${out}endsolid test\n`;
}

export function toObj(mesh) {
  let out = '# generated\n';
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    for (let c = 0; c < 3; c += 1) {
      const o = t * 9 + c * 3;
      out += `v ${mesh.positions[o]} ${mesh.positions[o + 1]} ${mesh.positions[o + 2]}\n`;
    }
  }
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    out += `f ${t * 3 + 1} ${t * 3 + 2} ${t * 3 + 3}\n`;
  }
  return out;
}

/** A 3MF model document for a mesh, with welded vertices. */
export function to3mfModel(mesh, unit = 'millimeter') {
  const keys = new Map();
  const verts = [];
  const tris = [];
  const idOf = (x, y, z) => {
    const k = `${x},${y},${z}`;
    if (!keys.has(k)) { keys.set(k, verts.length); verts.push([x, y, z]); }
    return keys.get(k);
  };
  for (let t = 0; t < mesh.triangleCount; t += 1) {
    const o = t * 9;
    tris.push([
      idOf(mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]),
      idOf(mesh.positions[o + 3], mesh.positions[o + 4], mesh.positions[o + 5]),
      idOf(mesh.positions[o + 6], mesh.positions[o + 7], mesh.positions[o + 8]),
    ]);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>
${verts.map(([x, y, z]) => `     <vertex x="${x}" y="${y}" z="${z}" />`).join('\n')}
    </vertices>
    <triangles>
${tris.map(([a, b, c]) => `     <triangle v1="${a}" v2="${b}" v3="${c}" />`).join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
</model>`;
}

/* ------------------------------------------------------------------ zip -- */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const size = chunks.reduce((total, c) => total + c.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/**
 * A real ZIP archive. `compress` chooses stored (method 0) or deflate
 * (method 8), because a 3MF in the wild may be either and both paths matter.
 */
export async function makeZip(files, { compress = true } = {}) {
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const raw = encoder.encode(text);
    const body = compress ? await deflateRaw(raw) : raw;
    const method = compress ? 8 : 0;
    const nameBytes = encoder.encode(name);
    const crc = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);
    locals.push(local);

    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += local.length;
  }

  const centralSize = central.reduce((total, c) => total + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of [...locals, ...central, eocd]) { out.set(chunk, at); at += chunk.length; }
  return out.buffer;
}
