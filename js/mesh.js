/**
 * Mesh readers. Pure - takes bytes, returns triangles, touches nothing else.
 *
 * A mesh is `{ positions, triangleCount, format, units, warnings }` where
 * `positions` is a Float32Array of 9 numbers per triangle. Everything
 * downstream works on that one shape, so adding a format never touches the
 * geometry code.
 *
 * Units: STL and OBJ carry none. The near-universal convention for 3D printing
 * is that one unit is one millimetre, and that is what this app assumes - but
 * it says so rather than pretending to know, because an OBJ exported from Blender
 * in metres is a thousand-fold error that looks like a pricing bug.
 */

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

export const MESH_FORMATS = ['stl', 'obj', '3mf'];

const decoder = new TextDecoder();

/** Binary STL is exactly 84 + 50n bytes. Nothing else is. */
export function looksBinaryStl(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_BYTES + 4) return false;
  const view = new DataView(buffer);
  const count = view.getUint32(HEADER_BYTES, true);
  return bytes.length === HEADER_BYTES + 4 + count * TRIANGLE_BYTES;
}

export function parseBinaryStl(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(HEADER_BYTES, true);
  const positions = new Float32Array(count * 9);

  let offset = HEADER_BYTES + 4;
  for (let t = 0; t < count; t += 1) {
    offset += 12;                       // the per-facet normal; recomputed, not trusted
    for (let i = 0; i < 9; i += 1) {
      positions[t * 9 + i] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2;                        // attribute byte count
  }
  return { positions, triangleCount: count, format: 'stl', units: 'mm', warnings: [] };
}

export function parseAsciiStl(text) {
  const numbers = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  let match = re.exec(text);
  while (match) {
    numbers.push(Number(match[1]), Number(match[2]), Number(match[3]));
    match = re.exec(text);
  }
  const triangleCount = Math.floor(numbers.length / 9);
  const positions = Float32Array.from(numbers.slice(0, triangleCount * 9));
  const warnings = [];
  if (numbers.length % 9 !== 0) warnings.push('The last facet was incomplete and has been dropped.');
  return { positions, triangleCount, format: 'stl', units: 'mm', warnings };
}

/** OBJ: v/f only. Textures, normals and materials do not affect volume. */
export function parseObj(text) {
  const vertices = [];
  const indices = [];
  const warnings = [];
  let groups = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);

    if (parts[0] === 'v') {
      vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (parts[0] === 'f') {
      const face = [];
      for (let i = 1; i < parts.length; i += 1) {
        const token = parts[i].split('/')[0];
        let index = Number.parseInt(token, 10);
        if (!Number.isFinite(index)) continue;
        // OBJ is 1-based, and a negative index counts back from the end.
        index = index < 0 ? vertices.length / 3 + index : index - 1;
        face.push(index);
      }
      // Fan triangulation. Correct for the convex faces exporters emit; a
      // concave n-gon would need ear clipping, which no printable export uses.
      for (let i = 1; i + 1 < face.length; i += 1) {
        indices.push(face[0], face[i], face[i + 1]);
      }
    } else if (parts[0] === 'o' || parts[0] === 'g') {
      groups += 1;
    }
  }

  const triangleCount = indices.length / 3;
  const positions = new Float32Array(triangleCount * 9);
  for (let t = 0; t < triangleCount; t += 1) {
    for (let c = 0; c < 3; c += 1) {
      const v = indices[t * 3 + c] * 3;
      positions[t * 9 + c * 3] = vertices[v] || 0;
      positions[t * 9 + c * 3 + 1] = vertices[v + 1] || 0;
      positions[t * 9 + c * 3 + 2] = vertices[v + 2] || 0;
    }
  }
  if (groups > 1) warnings.push(`The file declares ${groups} named groups; they are measured together.`);
  return { positions, triangleCount, format: 'obj', units: 'mm', warnings };
}

/**
 * The `<mesh>` of a 3MF model document.
 *
 * Read with a scanner rather than an XML parser: DOMParser is a browser API and
 * this module has to stay pure, and the vertex/triangle elements of a 3MF are
 * flat, attribute-only and never nested. Anything richer than that - a full
 * assembly with transforms - is reported rather than silently mismeasured.
 */
export function parse3mfModel(xml) {
  const warnings = [];
  const scale = unitScale(xml, warnings);

  const objects = [...xml.matchAll(/<object\b[^>]*>[\s\S]*?<\/object>/g)].map((m) => m[0]);
  const bodies = objects.length ? objects : [xml];

  const positions = [];
  let triangleCount = 0;
  let meshCount = 0;

  for (const body of bodies) {
    const verts = [];
    const re = /<vertex\b[^>]*\/>/g;
    let match = re.exec(body);
    while (match) {
      verts.push([
        attrNum(match[0], 'x'), attrNum(match[0], 'y'), attrNum(match[0], 'z'),
      ]);
      match = re.exec(body);
    }
    if (!verts.length) continue;
    meshCount += 1;

    const tre = /<triangle\b[^>]*\/>/g;
    let tmatch = tre.exec(body);
    while (tmatch) {
      const tag = tmatch[0];
      const a = verts[attrNum(tag, 'v1')];
      const b = verts[attrNum(tag, 'v2')];
      const c = verts[attrNum(tag, 'v3')];
      if (a && b && c) {
        positions.push(...a, ...b, ...c);
        triangleCount += 1;
      }
      tmatch = tre.exec(body);
    }
  }

  if (meshCount > 1) {
    warnings.push(`The file holds ${meshCount} objects; they are measured together.`);
  }
  if (/<component\b/.test(xml)) {
    warnings.push('The file uses components with transforms. Placement is ignored, '
      + 'so volume is right but the bounding box may be wrong.');
  }

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 1) out[i] = positions[i] * scale;
  return { positions: out, triangleCount, format: '3mf', units: 'mm', warnings };
}

function attrNum(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? Number(match[1]) : 0;
}

/** 3MF states its unit; unlike STL there is no guessing to do. */
function unitScale(xml, warnings) {
  const match = xml.match(/<model\b[^>]*\bunit="([^"]*)"/);
  const unit = match ? match[1] : 'millimeter';
  const table = {
    micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000,
  };
  const scale = table[unit];
  if (!scale) {
    warnings.push(`Unrecognised unit "${unit}"; measured as millimetres.`);
    return 1;
  }
  if (scale !== 1) warnings.push(`The file is in ${unit}; converted to millimetres.`);
  return scale;
}

/**
 * Read whatever this is.
 *
 * `inflate` is injected rather than imported so the module stays pure and the
 * 3MF path can be tested under Node with the same code the browser runs.
 */
export async function readMesh(name, buffer, { inflate = null } = {}) {
  const lower = String(name || '').toLowerCase();

  if (lower.endsWith('.3mf')) {
    if (!inflate) throw new Error('3MF needs an inflate function');
    const { unzipText } = await import('./zip.js');
    const xml = await unzipText(buffer, '3D/3dmodel.model', inflate);
    if (xml == null) throw new Error('No 3D/3dmodel.model inside the 3MF');
    return parse3mfModel(xml);
  }

  if (lower.endsWith('.obj')) return parseObj(decoder.decode(buffer));

  if (looksBinaryStl(buffer)) return parseBinaryStl(buffer);

  const text = decoder.decode(buffer.slice(0, Math.min(buffer.byteLength, 512)));
  if (/^\s*solid/i.test(text)) return parseAsciiStl(decoder.decode(buffer));

  throw new Error(`Cannot read ${name || 'this file'}: not an STL, OBJ or 3MF this app understands.`);
}
