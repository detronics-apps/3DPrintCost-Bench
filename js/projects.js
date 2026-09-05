/**
 * Projects, parts and production history. Pure.
 *
 * Two rules run through this file and both come straight from the
 * specification:
 *
 *   A released document is never rewritten. Company settings change; the quote
 *   that was sent last month did not. So every quote carries a frozen copy of
 *   the assumptions it was priced under, and re-opening it shows what was
 *   actually agreed rather than what today's settings would say.
 *
 *   Every edit returns a new object. Nothing here mutates what it was given,
 *   which is what makes revision history possible at all.
 */

import { num } from './money.js';

export const PROJECT_VERSION = 1;

export const PROJECT_STATUSES = [
  { id: 'draft', name: 'Draft', tone: 'info' },
  { id: 'quoted', name: 'Quoted', tone: 'info' },
  { id: 'accepted', name: 'Accepted', tone: 'ok' },
  { id: 'invoiced', name: 'Invoiced', tone: 'ok' },
  { id: 'paid', name: 'Paid', tone: 'ok' },
  { id: 'in-production', name: 'In production', tone: 'warn' },
  { id: 'complete', name: 'Complete', tone: 'ok' },
  { id: 'cancelled', name: 'Cancelled', tone: 'danger' },
  { id: 'archived', name: 'Archived', tone: 'info' },
];

export function statusOf(id) {
  return PROJECT_STATUSES.find((s) => s.id === id) || PROJECT_STATUSES[0];
}

/**
 * The order now moves through PHASES (see js/workflow.js); `status` is kept as a
 * compatibility shadow so the scheduler (which queues "in-production") and the
 * dashboard filter keep working without change. This maps a phase to that
 * shadow. Only `production` is a queued, on-a-machine state.
 */
export function statusFromPhase(phase) {
  switch (phase) {
    case 'awaiting-payment': return 'quoted';
    case 'production': return 'in-production';
    case 'post-processing':
    case 'packaging':
    case 'delivery':
    case 'closeout': return 'complete';
    case 'closed': return 'archived';
    case 'cancelled': return 'cancelled';
    case 'on-hold':
    case 'quotation':
    default: return 'draft';
  }
}

/** Map an older stored `status` onto the phase it corresponds to. */
export function phaseFromStatus(status) {
  switch (status) {
    case 'quoted':
    case 'draft': return 'quotation';
    case 'accepted':
    case 'invoiced': return 'awaiting-payment';
    case 'paid':
    case 'in-production': return 'production';
    case 'complete': return 'closeout';
    case 'cancelled': return 'cancelled';
    case 'archived': return 'closed';
    default: return 'quotation';
  }
}

/** The human-decision markers a phase workflow records, all empty to begin. */
export function defaultWorkflow() {
  return {
    quoteIssue: null,
    paymentReceivedAt: null,
    productionStartedAt: null,
    inspection: null,
    postProcessingDoneAt: null,
    readyForCollectionAt: null,
    collectedAt: null,
    deliveredAt: null,
    closeout: null,
    closedAt: null,
    cancelledFrom: null,
  };
}

/**
 * Append one event to the order's history, returning a new project. The history
 * is the audit trail the workflow keeps automatically — transitions and
 * production actions log through here, so nobody maintains a separate log.
 */
export function logEvent(project, type, text, meta = {}) {
  const entry = {
    id: makeId('ev'), at: nowIso(), type, text, ...meta,
  };
  return { ...project, history: [...(project.history || []), entry] };
}

/**
 * Ids are time-ordered and random-tailed, so two devices editing the same
 * exported file cannot collide and a sorted list is in creation order.
 */
export function makeId(prefix = 'id') {
  const stamp = Date.now().toString(36);
  const tail = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}${tail}`;
}

export const nowIso = () => new Date().toISOString();

export function makePart(spec = {}) {
  return {
    id: makeId('part'),
    name: 'New part',
    partNumber: '',
    revision: 'A',
    notes: '',
    quantity: 1,

    modelFileId: null,
    geometry: null,
    manual: { x: 50, y: 50, z: 50, volume: 0, area: 0 },
    orientedSize: null,

    profileId: 'function',
    settingOverrides: {},
    printerId: 'bambu-x1e',
    materialId: 'petg-dark-grey',
    // What is loaded to print this part, and how much of the part is each of it.
    // `slots` is [{ id, materialId }] — one per head/spool; `mix` is
    // [{ slotId, percent }]. Both null means "one spool of materialId", exactly
    // the single-colour behaviour every older project already has, so the engine
    // synthesises one slot from materialId and nothing changes.
    slots: null,
    mix: null,
    colours: 1,
    colourBands: [],
    hardware: [],
    complexity: 1,
    needsSupport: false,
    needsResin: false,
    needsDeburring: false,
    // Coding an embedded NFC tag is opt-in; nfcUrl is the link it should carry.
    nfcCode: false,
    nfcUrl: '',
    partsPerPlateOverride: 0,
    otherDirectCost: 0,

    estimateMethod: 'auto',
    slicer: null,
    discount: null,

    /** Every attempt ever made at this part. */
    attempts: [],
    ...spec,
  };
}

export function makeProject(spec = {}) {
  const at = nowIso();
  return {
    version: PROJECT_VERSION,
    id: makeId('proj'),
    number: '',
    name: 'New project',
    customerId: null,
    customerName: '',
    // The workflow phase is the source of truth; `status` is the compatibility
    // shadow the scheduler and dashboard still read (see statusFromPhase).
    phase: 'quotation',
    status: 'draft',
    onHoldFrom: null,
    workflow: defaultWorkflow(),
    // Internal orders are priced at cost only — no labour, no profit.
    //   'off'      a normal paying-customer order
    //   'employee' for a staff member: still quoted and paid, but at cost
    //   'company'  for the company itself (R&D, office): no quote, an expense
    internal: 'off',
    createdAt: at,
    modifiedAt: at,
    notes: '',
    parts: [],
    files: [],

    order: {
      shippingMethodId: 'auto',
      packagingContainerId: null,
      packagingConsumables: null,
      // Pickup: the customer collects, so no courier — but it is still boxed.
      packagingCollected: false,
      // No packaging at all: the parts are handed over as they come off the printer.
      noPackaging: false,
      insured: false,
      extras: [],
    },

    quotes: [],
    invoices: [],
    history: [],
    ...spec,
  };
}

/** The kinds of address, and the extra line each one needs. */
export const ADDRESS_TYPES = [
  { id: 'house', name: 'House' },
  { id: 'complex', name: 'Complex / estate' },
  { id: 'business', name: 'Business' },
];

/** A structured postal address. The freeform string is composed from this. */
export function makeAddressParts(spec = {}) {
  return {
    type: 'house',
    unit: '', // complex: unit / door number
    complex: '', // complex: complex or building name
    business: '', // business: business name
    street: '', // street number and name
    area: '', // suburb / area
    city: '', // city or town
    province: '',
    postalCode: '',
    country: '',
    ...spec,
  };
}

/**
 * Fold a structured address down to the lines that go on a document.
 *
 * The type only decides which extra line leads: a complex gets its unit and
 * name, a business its name, a house neither. Everything after that is common.
 * Empty fields are dropped so there are never blank lines or stray commas.
 */
export function formatAddress(parts) {
  if (!parts || typeof parts !== 'object') return typeof parts === 'string' ? parts : '';
  const lines = [];
  if (parts.type === 'business' && parts.business) lines.push(parts.business);
  if (parts.type === 'complex') {
    const lead = [parts.unit ? `Unit ${parts.unit}` : '', parts.complex].filter(Boolean).join(', ');
    if (lead) lines.push(lead);
  }
  if (parts.street) lines.push(parts.street);
  const cityLine = [parts.area, parts.city].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  const region = [parts.province, parts.postalCode].filter(Boolean).join(' ');
  if (region) lines.push(region);
  if (parts.country) lines.push(parts.country);
  return lines.join('\n');
}

export function makeCustomer(spec = {}) {
  return {
    id: makeId('cust'),
    name: 'New customer',
    email: '',
    phone: '',
    address: '',
    addressParts: makeAddressParts(),
    vatNumber: '',
    discount: { kind: 'none' },
    notes: '',
    archived: false,
    ...spec,
    // A caller that passes partial address parts still gets a complete object.
    ...(spec.addressParts ? { addressParts: makeAddressParts(spec.addressParts) } : {}),
  };
}

/** A file kept with the project. Contents stay in the browser. */
export function makeFile(spec = {}) {
  return {
    id: makeId('file'),
    name: 'file',
    kind: 'model',
    bytes: 0,
    addedAt: nowIso(),
    revision: 1,
    replaces: null,
    ...spec,
  };
}

/* ------------------------------------------------------------ edit helpers -- */

const touch = (project) => ({ ...project, modifiedAt: nowIso() });

export function addPart(project, part = makePart()) {
  return touch({ ...project, parts: [...project.parts, part] });
}

export function updatePart(project, partId, patch) {
  return touch({
    ...project,
    parts: project.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
  });
}

export function removePart(project, partId) {
  return touch({ ...project, parts: project.parts.filter((p) => p.id !== partId) });
}

/**
 * Duplicate a part. The production history does NOT come with it: a new part
 * has not been printed yet, and inheriting somebody else's success rate is the
 * fastest way to make the statistics lie.
 */
export function duplicatePart(project, partId) {
  const source = project.parts.find((p) => p.id === partId);
  if (!source) return project;
  const copy = {
    ...source,
    id: makeId('part'),
    name: `${source.name} (copy)`,
    attempts: [],
    revision: nextRevision(source.revision),
  };
  return addPart(project, copy);
}

/** A -> B -> ... -> Z -> AA. Revisions are letters; versions are numbers. */
export function nextRevision(revision) {
  // The default is applied to the ANSWER, not to the input: an absent revision
  // means this is the first one, so it is 'A' rather than 'A' incremented.
  const text = String(revision ?? '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(text)) return 'A';
  const chars = text.split('');
  let i = chars.length - 1;
  for (;;) {
    if (chars[i] !== 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); break; }
    chars[i] = 'A';
    i -= 1;
    if (i < 0) { chars.unshift('A'); break; }
  }
  return chars.join('');
}

export function duplicateProject(project, { name } = {}) {
  const at = nowIso();
  return {
    ...project,
    id: makeId('proj'),
    number: '',
    name: name || `${project.name} (copy)`,
    // A copy starts a fresh order: back at Quotation, no history, no documents.
    phase: 'quotation',
    status: 'draft',
    onHoldFrom: null,
    workflow: defaultWorkflow(),
    createdAt: at,
    modifiedAt: at,
    quotes: [],
    invoices: [],
    history: [],
    parts: project.parts.map((p) => ({ ...p, id: makeId('part'), attempts: [] })),
  };
}

export function setStatus(project, status, note = '') {
  const entry = {
    at: nowIso(),
    from: project.status,
    to: status,
    note,
  };
  return touch({ ...project, status, history: [...project.history, entry] });
}

export const archiveProject = (project) => setStatus(project, 'archived', 'Archived');

/* ------------------------------------------------------ production records -- */

export function makeAttempt(spec = {}) {
  return {
    id: makeId('run'),
    at: nowIso(),
    printerId: null,
    materialId: null,
    /** How many were on the plate. */
    quantity: 1,
    accepted: 1,
    rejected: 0,
    minutes: 0,
    grams: 0,
    failed: false,
    failureReason: '',
    rootCause: '',
    correctiveAction: '',
    reprinted: false,
    /** What the app predicted before the print, so the two can be compared. */
    estimatedMinutes: 0,
    estimatedGrams: 0,
    costPerAttempt: 0,
    notes: '',
    ...spec,
  };
}

export function recordAttempt(project, partId, attempt) {
  return touch({
    ...project,
    parts: project.parts.map((p) => (
      p.id === partId ? { ...p, attempts: [...p.attempts, makeAttempt(attempt)] } : p
    )),
  });
}

/**
 * Drop a recorded print.
 *
 * A print gets recorded once too often - the button was clicked twice, or the
 * plate was planned and never actually run - and there has to be a way to take
 * it back out. The stock the print booked out is reversed by the caller, which
 * owns the movement log; this only touches the part's own history.
 */
export function removeAttempt(project, partId, attemptId) {
  return touch({
    ...project,
    parts: project.parts.map((p) => (
      p.id === partId
        ? { ...p, attempts: (p.attempts || []).filter((a) => a.id !== attemptId) }
        : p
    )),
  });
}

/**
 * What actually happened to this part.
 *
 * Estimated-versus-actual is reported as a ratio as well as a difference,
 * because a 20-minute miss means something quite different on a 30-minute part
 * than on an eight-hour one.
 */
export function partStats(part) {
  const attempts = part.attempts || [];
  const printed = attempts.reduce((t, a) => t + Math.max(0, num(a.quantity, 1)), 0);
  const accepted = attempts.reduce((t, a) => t + Math.max(0, num(a.accepted)), 0);
  const rejected = attempts.reduce((t, a) => t + Math.max(0, num(a.rejected)), 0);
  const failures = attempts.filter((a) => a.failed).length;

  const actualMinutes = attempts.reduce((t, a) => t + num(a.minutes), 0);
  const actualGrams = attempts.reduce((t, a) => t + num(a.grams), 0);
  const estimatedMinutes = attempts.reduce((t, a) => t + num(a.estimatedMinutes), 0);
  const estimatedGrams = attempts.reduce((t, a) => t + num(a.estimatedGrams), 0);
  const cost = attempts.reduce((t, a) => t + num(a.costPerAttempt) * Math.max(1, num(a.quantity, 1)), 0);

  const ratio = (actual, estimated) => (estimated > 0 ? actual / estimated : null);

  return {
    attempts: attempts.length,
    printed,
    accepted,
    rejected,
    failures,
    rejectionRate: printed > 0 ? rejected / printed : null,
    actualMinutes,
    actualGrams,
    estimatedMinutes,
    estimatedGrams,
    timeRatio: ratio(actualMinutes, estimatedMinutes),
    materialRatio: ratio(actualGrams, estimatedGrams),
    cost,
    costPerAccepted: accepted > 0 ? cost / accepted : null,
    hasData: attempts.length > 0,
  };
}

export function projectStats(project) {
  const parts = project.parts.map((p) => ({ part: p, stats: partStats(p) }));
  const sum = (pick) => parts.reduce((t, p) => t + (num(pick(p.stats)) || 0), 0);
  return {
    parts: parts.length,
    units: project.parts.reduce((t, p) => t + Math.max(1, num(p.quantity, 1)), 0),
    printed: sum((s) => s.printed),
    accepted: sum((s) => s.accepted),
    rejected: sum((s) => s.rejected),
    failures: sum((s) => s.failures),
    actualMinutes: sum((s) => s.actualMinutes),
    actualGrams: sum((s) => s.actualGrams),
    perPart: parts,
  };
}

/* -------------------------------------------------------------- migration -- */

/**
 * Bring a stored project up to the current shape.
 *
 * Tested against a literal old blob rather than a freshly generated one, which
 * is the only version of this test that can fail (pitfalls #8).
 */
export function migrateProject(stored) {
  if (!stored || typeof stored !== 'object') return makeProject();
  const from = num(stored.version, 0);
  let raw = { ...stored };

  // v0 -> v1: parts used to carry `material` and `printer` as names, and a
  // single `runs` array with a different shape.
  if (from < 1) {
    raw.parts = (raw.parts || []).map((part) => {
      const next = { ...part };
      if (next.material && !next.materialId) next.materialId = String(next.material);
      if (next.printer && !next.printerId) next.printerId = String(next.printer);
      delete next.material;
      delete next.printer;
      if (Array.isArray(next.runs) && !Array.isArray(next.attempts)) {
        next.attempts = next.runs.map((r) => makeAttempt({
          minutes: r.time, grams: r.material, accepted: r.ok, rejected: r.bad,
        }));
        delete next.runs;
      }
      return next;
    });
    raw.version = 1;
  }

  const base = makeProject();
  const project = { ...base, ...raw, version: PROJECT_VERSION };
  project.parts = (raw.parts || []).map((part) => ({
    ...makePart(),
    ...part,
    attempts: (part.attempts || []).map((a) => ({ ...makeAttempt(), ...a })),
  }));
  project.order = { ...base.order, ...(raw.order || {}) };

  // Workflow phase is the source of truth. An already-migrated project keeps its
  // phase; an older one has only `status`, so its phase is derived from that.
  const PHASE_IDS = [
    'quotation', 'awaiting-payment', 'production', 'post-processing',
    'packaging', 'delivery', 'closeout', 'closed', 'cancelled', 'on-hold',
  ];
  project.phase = PHASE_IDS.includes(raw.phase) ? raw.phase : phaseFromStatus(raw.status);
  project.onHoldFrom = raw.onHoldFrom || null;
  project.workflow = { ...defaultWorkflow(), ...(raw.workflow || {}) };
  project.status = statusFromPhase(project.phase);
  // `internal` used to be a boolean; a true one becomes an employee order.
  if (raw.internal === true) project.internal = 'employee';
  else if (!['off', 'employee', 'company'].includes(raw.internal)) project.internal = 'off';
  project.history = Array.isArray(raw.history) ? raw.history : [];
  project.quotes = Array.isArray(raw.quotes) ? raw.quotes : [];
  project.invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
  return project;
}

/** A project as a line for the order the engine understands. */
export function orderFromProject(project, { customer = null } = {}) {
  return {
    ...project.order,
    lines: project.parts.map((part) => ({
      quantity: part.quantity,
      profileId: part.profileId,
      settingOverrides: part.settingOverrides,
      printerId: part.printerId,
      materialId: part.materialId,
      // The loaded filament and this part's share of it, so a multi-material
      // machine prices every head. Absent on older parts, which fall back to a
      // single slot synthesised from materialId.
      slots: part.slots || null,
      mix: part.mix || null,
      geometry: part.geometry,
      manual: part.manual,
      orientedSize: part.orientedSize,
      colours: part.colours,
      colourBands: part.colourBands,
      hardware: part.hardware,
      complexity: part.complexity,
      needsSupport: part.needsSupport,
      needsResin: part.needsResin,
      needsDeburring: part.needsDeburring,
      nfcCode: part.nfcCode,
      partsPerPlateOverride: part.partsPerPlateOverride,
      otherDirectCost: part.otherDirectCost,
      estimateMethod: part.estimateMethod,
      slicer: perPartSlicer(part),
      actual: latestActual(part),
      discount: part.discount || customer?.discount || null,
      partId: part.id,
      name: part.name,
    })),
  };
}

/**
 * Slicer figures on a project part are entered as TOTALS for the whole print of
 * that part — the grams off each head and the print time the slicer reports for
 * the plate as sliced, not per single unit. The engine works per part and
 * multiplies back up by quantity, so the totals are divided down to a per-part
 * share here. (Recorded production figures do the same, in `latestActual`.)
 */
function perPartSlicer(part) {
  const slicer = part.slicer;
  if (!slicer) return null;
  const qty = Math.max(1, num(part.quantity, 1));
  if (qty === 1) return slicer;
  return {
    ...slicer,
    grams: slicer.grams != null ? num(slicer.grams) / qty : slicer.grams,
    minutes: slicer.minutes != null ? num(slicer.minutes) / qty : slicer.minutes,
    heads: Array.isArray(slicer.heads)
      ? slicer.heads.map((h) => ({ ...h, grams: num(h.grams) / qty }))
      : slicer.heads,
  };
}

/** The most recent successful run, which is what "actual" means for pricing. */
function latestActual(part) {
  const good = (part.attempts || []).filter((a) => !a.failed && num(a.accepted) > 0);
  if (!good.length) return null;
  const last = good[good.length - 1];
  const each = Math.max(1, num(last.quantity, 1));
  return { minutes: num(last.minutes) / each, grams: num(last.grams) / each };
}
