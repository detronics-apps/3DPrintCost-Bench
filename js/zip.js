/**
 * Just enough ZIP to open a 3MF. Pure.
 *
 * A 3MF is a ZIP with the model in `3D/3dmodel.model`. Reading the central
 * directory is a dozen fixed-width fields, so it is worth doing; DEFLATE is
 * not, and the platform already has it - `DecompressionStream('deflate-raw')`
 * exists in every browser this app targets and in Node 18 and later.
 *
 * The decompressor is passed in rather than imported, which keeps this module
 * free of globals and lets the tests drive the same code the browser runs.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const decoder = new TextDecoder();

/** Find the end-of-central-directory record, scanning back over any comment. */
function findEocd(view) {
  const max = Math.min(view.byteLength, 0xffff + 22);
  for (let i = 22; i <= max; i += 1) {
    const at = view.byteLength - i;
    if (at < 0) break;
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  return -1;
}

/** Every entry in the archive: name, method, and where its bytes are. */
export function listEntries(buffer) {
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (at + 46 > view.byteLength) break;
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) break;

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength));

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The compressed bytes of one entry, found through its local header. */
export function rawBytes(buffer, entry) {
  const view = new DataView(buffer);
  const at = entry.localOffset;
  if (view.getUint32(at, true) !== LOCAL_SIGNATURE) throw new Error(`Bad local header for ${entry.name}`);
  const nameLength = view.getUint16(at + 26, true);
  const extraLength = view.getUint16(at + 28, true);
  const start = at + 30 + nameLength + extraLength;
  return new Uint8Array(buffer, start, entry.compressedSize);
}

/**
 * `deflate-raw` through whatever decompressor was handed in.
 * The default uses the platform's own, which both the browser and Node provide.
 */
export const platformInflate = async (bytes) => {
  const stream = new DecompressionStream('deflate-raw');
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
};

/** One named entry, decompressed, as text. `null` when it is not in there. */
export async function unzipText(buffer, path, inflate = platformInflate) {
  const entry = listEntries(buffer).find((e) => e.name === path)
    || listEntries(buffer).find((e) => e.name.toLowerCase() === path.toLowerCase());
  if (!entry) return null;

  const bytes = rawBytes(buffer, entry);
  if (entry.method === 0) return decoder.decode(bytes);
  if (entry.method === 8) return decoder.decode(await inflate(bytes));
  throw new Error(`${entry.name} uses compression method ${entry.method}, which this app cannot read`);
}
