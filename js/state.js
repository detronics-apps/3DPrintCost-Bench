/**
 * The one state object, and the three ways it persists.
 *
 *   localStorage   stays on this device
 *   URL fragment   sharing - fragments are NEVER transmitted to a server, which
 *                  is what makes a share link private
 *   JSON file      save and open, entirely local
 *
 * Nothing here reaches a network. There is no analytics, no cookie and no
 * third-party anything in this app; see the README's Privacy section.
 *
 * This is the one module under js/ that is not pure, because persistence is
 * where the browser has to be touched. Everything it stores is shaped and
 * migrated by the pure modules, so the interesting logic stays testable.
 */

import { migrateSettings, defaultSettings } from './settings.js';
import { migrateProject, makeProject, makeCustomer } from './projects.js';
import { num } from './money.js';

const KEY = '3d-printing-bench';
export const STATE_VERSION = 1;

export const MODES = [
  { id: 'simple', name: 'Simple', hint: 'For someone who just wants their part printed — pick the essentials and get a price.' },
  { id: 'advanced', name: 'Advanced', hint: 'For someone who has run printers before — every cost, plus your own settings and slicer figures.' },
  { id: 'expert', name: 'Expert', hint: 'Learn how the tool works — the assumptions and formulas behind every number, and why.' },
];

let partCounter = 0;
const nextPartId = () => {
  partCounter += 1;
  return `qp${Date.now().toString(36)}${partCounter}${Math.random().toString(36).slice(2, 5)}`;
};

/**
 * One model on the bed: its own file, its own quantity, its own print intent.
 *
 * Everything that belongs to the MACHINE - which printer, what is loaded in it
 * - lives one level up, on `quick` itself, because every part on the bed draws
 * from the same setup. Everything here is a fact about one shape: how many of
 * it, what it is for, and how much of the loaded filament it is made from.
 */
export function defaultPart(spec = {}) {
  return {
    id: nextPartId(),
    name: 'Part 1',
    quantity: 1,
    profileId: 'function',
    settingOverrides: {},
    mix: null,
    hardware: [],
    complexity: 1,
    needsSupport: false,
    needsResin: false,
    needsDeburring: false,
    // The colours this part loads, as material ids. Used by the multi-colour
    // plate planner to split a bed when the parts on it need more distinct
    // colours than the machine can hold at once.
    colourSet: [],
    // Colour by Z-height: ordered bands [{ upTo, materialId }] from the bed up.
    // When a part uses more colours than the machine's heads, the ones beyond
    // them become manual pause-swaps at their band heights.
    colourBands: [],
    partsPerPlateOverride: 0,
    otherDirectCost: 0,
    estimateMethod: 'auto',
    slicer: null,
    manual: { x: 60, y: 40, z: 25, volume: 0, area: 0 },
    geometry: null,
    modelName: null,
    orientedSize: null,
    orientedUp: null,
    ...spec,
  };
}

/** The scratch bed the Estimate tab works on: one machine, several models. */
export function defaultQuick() {
  return {
    name: 'Quick estimate',
    printerId: 'bambu-x1e',
    materialId: 'petg-dark-grey',
    // What is loaded in the machine. Belongs to the bed, not to any one part:
    // every part printed in this setup draws from these spools.
    slots: null,
    parts: [defaultPart()],
    discount: { kind: 'none' },
    order: {
      shippingMethodId: 'auto',
      packagingContainerId: null,
      packagingCollected: false,
      insured: false,
      extras: [],
    },
  };
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    tool: 'estimate',
    mode: 'simple',
    theme: 'system',
    settings: defaultSettings(),
    projects: [],
    customers: [],
    inventory: { items: [], movements: [] },
    activeProjectId: null,
    activePartId: null,
    activeDocumentId: null,
    quick: defaultQuick(),
    ui: {
      sections: {},
      catalogue: 'printers',
      settingsSection: 'company',
      filter: {},
      comparePrinters: false,
      selectedEstimatePart: null,
      /** When the workshop was last saved to a file, for the backup reminder. */
      lastBackupAt: null,
    },
  };
}

export const state = defaultState();

/* ------------------------------------------------------------ migration -- */

/**
 * Bring any stored blob up to the current shape.
 *
 * Coalesced rather than spread: `{ ...defaults, ...incoming }` overwrites a
 * good default with `undefined` whenever the stored object carries the key
 * explicitly (pitfalls #8).
 */
export function migrateState(stored) {
  const base = defaultState();
  if (!stored || typeof stored !== 'object') return base;

  const next = {
    ...base,
    version: STATE_VERSION,
    tool: typeof stored.tool === 'string' ? stored.tool : base.tool,
    mode: MODES.some((m) => m.id === stored.mode) ? stored.mode : base.mode,
    theme: ['system', 'light', 'dark'].includes(stored.theme) ? stored.theme : base.theme,
    settings: migrateSettings(stored.settings),
    projects: Array.isArray(stored.projects) ? stored.projects.map(migrateProject) : [],
    customers: Array.isArray(stored.customers)
      ? stored.customers.map((c) => makeCustomer(c))
      : [],
    inventory: {
      items: Array.isArray(stored.inventory?.items) ? stored.inventory.items : [],
      movements: Array.isArray(stored.inventory?.movements) ? stored.inventory.movements : [],
    },
    activeProjectId: stored.activeProjectId ?? null,
    activePartId: stored.activePartId ?? null,
    activeDocumentId: stored.activeDocumentId ?? null,
    quick: { ...defaultQuick(), ...(stored.quick || {}) },
    ui: { ...base.ui, ...(stored.ui || {}) },
  };

  // A remembered active id that no longer exists points at nothing; clear it
  // rather than letting a screen open on an empty object.
  if (next.activeProjectId && !next.projects.some((p) => p.id === next.activeProjectId)) {
    next.activeProjectId = null;
    next.activePartId = null;
  }
  next.quick.order = { ...defaultQuick().order, ...(stored.quick?.order || {}) };
  next.quick.parts = migrateQuickParts(stored.quick);
  return next;
}

/**
 * The bed used to hold exactly one part, with its fields sitting directly on
 * `quick` (`quick.geometry`, `quick.quantity`, and so on). A file saved before
 * several models could share a bed still has that shape, and its part would
 * otherwise simply vanish - lifted here into a one-part list instead, so
 * nothing anybody had on screen is lost.
 */
function migrateQuickParts(storedQuick) {
  const q = storedQuick || {};

  if (Array.isArray(q.parts) && q.parts.length) {
    return q.parts.map((p) => ({ ...defaultPart(), ...p }));
  }

  // Only migrate the old single-part shape if it actually looks like one -
  // otherwise this is a brand-new bed and should get the ordinary default.
  const hadOldShape = ['geometry', 'quantity', 'profileId', 'manual', 'modelName']
    .some((key) => key in q);
  if (!hadOldShape) return [defaultPart()];

  return [defaultPart({
    name: q.name && q.name !== 'Quick estimate' ? q.name : 'Part 1',
    quantity: q.quantity ?? 1,
    profileId: q.profileId || 'function',
    settingOverrides: q.settingOverrides || {},
    mix: q.mix ?? null,
    hardware: Array.isArray(q.hardware) ? q.hardware : [],
    complexity: q.complexity ?? 1,
    partsPerPlateOverride: q.partsPerPlateOverride ?? 0,
    otherDirectCost: q.otherDirectCost ?? 0,
    estimateMethod: q.estimateMethod || 'auto',
    slicer: q.slicer ?? null,
    manual: q.manual || defaultPart().manual,
    geometry: q.geometry ?? null,
    modelName: q.modelName ?? null,
    orientedSize: q.orientedSize ?? null,
    orientedUp: q.orientedUp ?? null,
  })];
}

/* ---------------------------------------------------------- persistence -- */

let saveTimer = null;

export function load() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch { /* corrupt storage is not worth crashing over */ }

  Object.assign(state, migrateState(stored));

  if (location.hash.length > 1) {
    try {
      const shared = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      const result = applyShared(shared);
      // A request link creates a project the moment it is opened; leaving it in
      // the address bar would import a duplicate on the next refresh, so the
      // fragment is cleared once it has been read.
      if (result?.importedRequest && typeof history !== 'undefined') {
        try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
      }
    } catch { /* an unreadable link should not stop the app loading */ }
  }
  return state;
}

/**
 * Something to run after every save - the team-sync module registers here so a
 * change on this device is written out to the shared file too. It is a single
 * hook, not a list, because there is exactly one syncer and a list would only
 * invite a second one to fight it.
 */
let saveHook = null;
export function onSaved(fn) { saveHook = typeof fn === 'function' ? fn : null; }

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* private browsing, or a full quota */ }
  if (saveHook) { try { saveHook(); } catch { /* a sync failure must not break saving */ } }
}

/**
 * Replace the whole workshop from a full export (what `exportAll` produces).
 *
 * Used when the shared file is the source of truth - a colleague's version is
 * loaded wholesale, not merged, because sync means "match the file", and a merge
 * would quietly resurrect things they deleted.
 */
export function applyWorkshop(data) {
  if (!data || typeof data !== 'object') return false;
  state.settings = migrateSettings(data.settings);
  state.projects = Array.isArray(data.projects) ? data.projects.map(migrateProject) : [];
  state.customers = Array.isArray(data.customers) ? data.customers.map((c) => makeCustomer(c)) : [];
  state.inventory = data.inventory && typeof data.inventory === 'object'
    ? {
      items: Array.isArray(data.inventory.items) ? data.inventory.items : [],
      movements: Array.isArray(data.inventory.movements) ? data.inventory.movements : [],
    }
    : { items: [], movements: [] };
  if (state.activeProjectId && !state.projects.some((p) => p.id === state.activeProjectId)) {
    state.activeProjectId = null;
    state.activePartId = null;
  }
  save();
  return true;
}

/** Coalesced save, so typing does not write to storage on every keystroke. */
export function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 350);
}

export function resetAll() {
  Object.assign(state, defaultState());
  save();
}

/* -------------------------------------------------------------- sharing -- */

/**
 * A share link carries the quick estimate and the pricing assumptions behind
 * it - not the project list, which would not fit in a URL and is nobody else's
 * business anyway.
 */
export function shareLink() {
  const payload = {
    v: STATE_VERSION,
    quick: state.quick,
    mode: state.mode,
    pricing: {
      countryId: state.settings.countryId,
      currencyCode: state.settings.currencyCode,
      thirds: state.settings.thirds,
      ctc: state.settings.ctc,
      scrap: state.settings.scrap,
      demand: state.settings.demand,
      freeShipping: state.settings.freeShipping,
      tax: state.settings.tax,
      presetId: state.settings.presetId,
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `${location.origin}${location.pathname}#${encoded}`;
}

function applyShared(shared) {
  if (!shared || typeof shared !== 'object') return {};

  // A customer's request, arriving as a link instead of a file. It carries a
  // whole project and the customer behind it, so it is imported exactly as the
  // Open button would, then the workshop is taken to it.
  if (shared.kind === 'project' && shared.project) {
    const project = migrateProject(shared.project);
    const clash = state.projects.some((p) => p.id === project.id);
    const added = clash ? { ...project, id: makeProject().id } : project;
    state.projects.push(added);
    if (shared.customer) {
      const customer = makeCustomer(shared.customer);
      if (!state.customers.some((c) => c.id === customer.id)) state.customers.push(customer);
    }
    state.activeProjectId = added.id;
    state.tool = 'projects';
    return { importedRequest: true };
  }

  if (shared.quick) {
    state.quick = { ...defaultQuick(), ...shared.quick };
    state.quick.parts = migrateQuickParts(shared.quick);
  }
  if (MODES.some((m) => m.id === shared.mode)) state.mode = shared.mode;
  if (shared.pricing) {
    state.settings = migrateSettings({ ...state.settings, ...shared.pricing });
  }
  state.tool = 'estimate';
  return {};
}

/* --------------------------------------------------------- save and open -- */

/** Everything, as a file. The whole workshop, on the user's own disk. */
export function exportAll() {
  return JSON.stringify({
    app: '3DPrintCost Bench',
    version: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    projects: state.projects,
    customers: state.customers,
    inventory: state.inventory,
  }, null, 2);
}

export function exportProject(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const customer = state.customers.find((c) => c.id === project.customerId) || null;
  return JSON.stringify({
    app: '3DPrintCost Bench',
    kind: 'project',
    version: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    customer,
    /** The assumptions, so the receiver can see what it was priced under. */
    settings: state.settings,
  }, null, 2);
}

/**
 * Read a file back.
 *
 * Returns a report rather than throwing, because "this file had three projects
 * and one of them was unreadable" is far more useful than a stack trace.
 */
export function importFile(text, { merge = true } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'That file does not hold anything this app can read.' };
  }

  const report = { ok: true, projects: 0, customers: 0, settings: false, skipped: 0 };

  const incoming = data.kind === 'project'
    ? [data.project].filter(Boolean)
    : (Array.isArray(data.projects) ? data.projects : []);

  for (const raw of incoming) {
    try {
      const project = migrateProject(raw);
      const existing = state.projects.findIndex((p) => p.id === project.id);
      if (existing >= 0 && merge) state.projects[existing] = project;
      else state.projects.push(existing >= 0 ? { ...project, id: makeProject().id } : project);
      report.projects += 1;
    } catch {
      report.skipped += 1;
    }
  }

  for (const raw of (data.customers || (data.customer ? [data.customer] : []))) {
    if (!raw) continue;
    const customer = makeCustomer(raw);
    const existing = state.customers.findIndex((c) => c.id === customer.id);
    if (existing >= 0) state.customers[existing] = customer;
    else state.customers.push(customer);
    report.customers += 1;
  }

  if (data.inventory && !merge) state.inventory = data.inventory;
  else if (data.inventory) {
    const known = new Set(state.inventory.items.map((i) => i.id));
    for (const item of data.inventory.items || []) if (!known.has(item.id)) state.inventory.items.push(item);
    const seen = new Set(state.inventory.movements.map((m) => m.id));
    for (const mv of data.inventory.movements || []) if (!seen.has(mv.id)) state.inventory.movements.push(mv);
  }

  // Settings are only replaced on an explicit whole-workshop import: pulling one
  // project in from a colleague must not silently reprice everything else.
  if (data.settings && !merge) {
    state.settings = migrateSettings(data.settings);
    report.settings = true;
  }

  save();
  return report;
}

/**
 * Restore an ENTIRE workshop from a "Save all" backup file.
 *
 * This is the counterpart to exportAll, and the answer to "how do I open the
 * latest version of the app without losing what I built". Unlike Open - which
 * merges in projects and deliberately leaves your setup untouched - this brings
 * back everything the file holds: the settings and every catalogue, the projects
 * with their quotes and invoices, the customers and the inventory. It all goes
 * through the same migrations that upgrade older data to this build, so a file
 * saved by a previous revision loads cleanly into a newer one.
 *
 * It REPLACES the current workshop wholesale, so the caller confirms first when
 * there is anything to lose.
 */
export function restoreFromFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (data && data.kind === 'project') {
    // A customer request also carries settings, so it would otherwise pass the
    // check below and replace the whole workshop with one project. Open is for
    // switching companies; a single project is merged in with Upload project.
    return {
      ok: false,
      error: 'That is a single project, not a workshop. Use “Upload project” to add it '
        + 'to the company you have open.',
    };
  }
  if (!data || typeof data !== 'object' || !data.settings) {
    return { ok: false, error: 'That is not a full workshop backup — use “Save all” to make one.' };
  }

  const projects = Array.isArray(data.projects) ? data.projects : [];
  const count = (key) => projects.reduce((n, p) => n + (Array.isArray(p[key]) ? p[key].length : 0), 0);

  applyWorkshop(data);
  return {
    ok: true,
    projects: projects.length,
    customers: Array.isArray(data.customers) ? data.customers.length : 0,
    quotes: count('quotes'),
    invoices: count('invoices'),
  };
}

/* ---------------------------------------------------------------- lookup -- */

export const activeProject = () => state.projects.find((p) => p.id === state.activeProjectId) || null;

export const activePart = () => {
  const project = activeProject();
  return project?.parts.find((p) => p.id === state.activePartId) || null;
};

export function replaceProject(project) {
  const index = state.projects.findIndex((p) => p.id === project.id);
  if (index >= 0) state.projects[index] = project;
  else state.projects.push(project);
  saveSoon();
  return project;
}

export function customerFor(project) {
  if (!project?.customerId) return null;
  return state.customers.find((c) => c.id === project.customerId) || null;
}

/** Section open/closed, namespaced by tool so two panels never share a key. */
export const sectionStore = {
  get: (id) => state.ui.sections[`${state.tool}:${id}`],
  set: (id, open) => {
    state.ui.sections[`${state.tool}:${id}`] = open;
    saveSoon();
  },
};

export const isFinite2 = (value) => Number.isFinite(num(value));
