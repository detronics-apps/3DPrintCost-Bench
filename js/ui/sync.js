/**
 * Team sync through a shared file.
 *
 * No server anywhere - this connects the app to one `workshop.json` that the
 * person keeps in a Google Drive or OneDrive folder synced to their computer.
 * The app writes the whole workshop to that file whenever it changes, and the
 * cloud's own desktop app carries it to a colleague, whose copy is connected to
 * the same file. It is near-real-time, not live: the honest limits (Chrome/Edge
 * on a computer, and simultaneous edits to the same thing) are stated on the
 * screen that offers it.
 *
 * Safety first, because there is no undo on someone else's data: before it ever
 * overwrites the file it checks whether the file changed since we last saw it.
 * If it did, it does NOT clobber their work - it raises a conflict and lets the
 * person choose whose version wins.
 */

import { exportAll, applyWorkshop, onSaved } from '../state.js';

const DB_NAME = '3d-printing-bench-sync';
const STORE = 'handles';
const HANDLE_KEY = 'workshop';
const WRITE_DELAY = 1200;

let handle = null;
let lastSyncedText = null; // the file's content as we last read or wrote it
let lastSavedAt = null;
let conflict = false;
let error = null;
let suppressWrite = false;
let writeTimer = null;
let listener = null;

export function syncSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export function syncState() {
  return {
    supported: syncSupported(),
    connected: !!handle,
    name: handle?.name || null,
    lastSavedAt,
    conflict,
    error,
  };
}

/** Called by the UI so a change here (connect, conflict, save) redraws. */
export function subscribeSync(fn) { listener = typeof fn === 'function' ? fn : null; }
const notify = () => { if (listener) listener(); };

/* --------------------------------------------------------- handle storage -- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putHandle(h) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(h, HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getHandle() {
  const db = await openDb();
  const h = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(HANDLE_KEY);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return h;
}

async function clearHandle() {
  const db = await openDb();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  db.close();
}

/* ----------------------------------------------------------- file access -- */

async function ensurePermission(h, { request = false } = {}) {
  const opts = { mode: 'readwrite' };
  if ((await h.queryPermission(opts)) === 'granted') return true;
  if (request && (await h.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function readFile() {
  const file = await handle.getFile();
  return file.text();
}

async function writeText(text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/* ------------------------------------------------------------- the sync -- */

/** Load the file wholesale into the app. The file wins. */
async function loadNow() {
  const text = await readFile();
  if (text && text.trim()) {
    suppressWrite = true;
    try { applyWorkshop(JSON.parse(text)); } finally { suppressWrite = false; }
  }
  lastSyncedText = text;
  conflict = false;
  error = null;
}

/** Write our whole workshop over the file. Our version wins. */
async function writeNow() {
  const text = exportAll();
  await writeText(text);
  lastSyncedText = text;
  lastSavedAt = Date.now();
  conflict = false;
  error = null;
}

/**
 * The debounced writer, wired to every save. It never overwrites blind: if the
 * file moved under us since we last saw it, that is a colleague's change and it
 * becomes a conflict for the person to resolve, not a silent loss.
 */
function scheduleWrite() {
  if (!handle || suppressWrite) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    try {
      if (!(await ensurePermission(handle))) return;
      const current = await readFile();
      if (lastSyncedText != null && current !== lastSyncedText) {
        conflict = true;
        notify();
        return;
      }
      await writeNow();
      notify();
    } catch (e) {
      error = e?.message || 'sync write failed';
      notify();
    }
  }, WRITE_DELAY);
}

/** Has the shared file changed under us? Called when the tab regains focus. */
export async function checkForChanges() {
  if (!handle || conflict) return;
  try {
    if (!(await ensurePermission(handle))) return;
    const current = await readFile();
    if (lastSyncedText != null && current !== lastSyncedText) {
      conflict = true;
      notify();
    }
  } catch { /* a transient read failure is not worth shouting about */ }
}

/* ---------------------------------------------------------- user actions -- */

/**
 * Connect a file. `create` makes a new one; otherwise an existing file is
 * opened. On an existing non-empty file the caller decides load vs overwrite.
 */
export async function connectSync({ create = false } = {}) {
  const types = [{ description: 'Workshop data', accept: { 'application/json': ['.json'] } }];
  handle = create
    ? await window.showSaveFilePicker({ suggestedName: 'workshop.json', types })
    : (await window.showOpenFilePicker({ types, multiple: false }))[0];
  await ensurePermission(handle, { request: true });
  await putHandle(handle);

  const text = await readFile();
  const hasContent = !!(text && text.trim());
  lastSyncedText = text;
  error = null;
  if (create || !hasContent) {
    await writeNow(); // a new or empty file is seeded with what is here
  } else {
    // The file already holds a workshop, so the person must choose whose wins;
    // this raises the same choice a later conflict does.
    conflict = true;
  }
  notify();
  return { hasContent: hasContent && !create };
}

/** First-connect / conflict choice: take the file's version. */
export async function loadFromFile() {
  if (!handle) return;
  try { await loadNow(); } catch (e) { error = e?.message || 'could not load the file'; }
  notify();
}

/** First-connect / conflict choice: keep this device's version. */
export async function keepMine() {
  if (!handle) return;
  try {
    if (await ensurePermission(handle, { request: true })) await writeNow();
  } catch (e) { error = e?.message || 'could not save to the file'; }
  notify();
}

export async function disconnectSync() {
  handle = null;
  lastSyncedText = null;
  lastSavedAt = null;
  conflict = false;
  error = null;
  await clearHandle();
  notify();
}

/**
 * On start-up, bring back the connected file. The browser often needs a fresh
 * click to re-grant permission after a restart, so this only reconnects
 * silently when permission is still granted; otherwise the UI shows a Reconnect
 * button that asks for it inside a user gesture.
 */
export async function restoreSync() {
  if (!syncSupported()) return;
  try {
    const h = await getHandle();
    if (!h) return;
    handle = h;
    if (await ensurePermission(handle)) {
      // Permission survived: adopt the file as the truth and catch up to it.
      await loadNow();
    }
  } catch { /* nothing to restore */ }
  notify();
}

/** Re-grant permission after a restart (must be called from a click). */
export async function reconnectSync() {
  if (!handle) return false;
  try {
    if (await ensurePermission(handle, { request: true })) {
      await loadNow();
      notify();
      return true;
    }
  } catch (e) { error = e?.message || 'could not reconnect'; notify(); }
  return false;
}

export function syncNeedsPermission() {
  return !!handle && !lastSyncedText && !error;
}

// Every save on this device schedules a write to the shared file.
onSaved(scheduleWrite);
