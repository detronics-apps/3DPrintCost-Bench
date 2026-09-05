/**
 * The order workflow: six phases from quotation to closeout. Pure.
 *
 * The principle is minimum manual administration, maximum automatic detection.
 * The app already records what happened — parts sliced, a quote raised, prints
 * recorded, inspection called, post-processing required — so progress is DERIVED
 * from that data wherever it can be, and the operator is asked only for genuine
 * decisions (issue? paid? passed inspection? reprint? delivered?).
 *
 * `phase` on the project is the source of truth. `advance` applies a transition,
 * records the human-decision marker it implies, keeps the `status` shadow in
 * step (for the scheduler and dashboard), and logs the event — so the history is
 * an audit trail nobody has to maintain by hand.
 *
 * The external client estimate is deliberately NOT a phase here: an imported
 * request lands directly in Quotation.
 */

import { num } from './money.js';
import {
  projectStats, logEvent, statusFromPhase, nowIso, defaultWorkflow,
} from './projects.js';

/** The six operational phases, weighted by effort for the overall bar. */
export const PHASES = [
  { id: 'quotation', name: 'Quotation', weight: 15 },
  { id: 'awaiting-payment', name: 'Awaiting payment', weight: 5, waiting: true },
  { id: 'production', name: 'Production', weight: 35 },
  { id: 'post-processing', name: 'Post-processing', weight: 10 },
  { id: 'packaging', name: 'Packaging', weight: 10 },
  { id: 'delivery', name: 'Delivery', weight: 15 },
  { id: 'closeout', name: 'Closeout', weight: 10 },
];

export const PHASE_ORDER = PHASES.map((p) => p.id);

const NAMES = {
  ...Object.fromEntries(PHASES.map((p) => [p.id, p.name])),
  closed: 'Closed',
  cancelled: 'Cancelled',
  'on-hold': 'On hold',
};

export const phaseName = (id) => NAMES[id] || id;
export const phaseInfo = (id) => PHASES.find((p) => p.id === id) || null;

/* ----------------------------------------------------- derived facts ------ */

/** Post-processing is required if any part asks for finishing work. */
export function postProcessingRequired(project) {
  return (project.parts || []).some((p) => p.needsResin || p.needsSupport || p.needsDeburring
    || (p.hardware || []).some((h) => h && h.fit === true));
}

/** A part counts as sliced once it carries any slicer figure. */
function partSliced(part) {
  const s = part.slicer;
  if (!s) return false;
  return num(s.grams) > 0 || num(s.minutes) > 0
    || (Array.isArray(s.heads) && s.heads.some((h) => num(h.grams) > 0));
}

function facts(project) {
  const stats = projectStats(project);
  return {
    sliced: (project.parts || []).length > 0 && project.parts.every(partSliced),
    hasQuote: (project.quotes || []).length > 0,
    ppRequired: postProcessingRequired(project),
    attempts: (project.parts || []).reduce((t, p) => t + (p.attempts || []).length, 0),
    accepted: stats.accepted,
    required: stats.units,
  };
}

const fraction = (steps) => (steps.length
  ? steps.filter((s) => s.done).length / steps.length : 0);

/** Steps and progress (0..1) for one phase, from recorded data. */
function phaseDetail(project, phaseId, f) {
  const wf = project.workflow || defaultWorkflow();
  switch (phaseId) {
    case 'quotation': {
      const steps = [
        { label: 'Parts sliced and verified', done: f.sliced },
        { label: 'Quotation prepared', done: f.hasQuote },
      ];
      return { steps, progress: fraction(steps) };
    }
    case 'awaiting-payment': {
      const steps = [
        { label: 'Quotation sent', done: true },
        { label: 'Payment received', done: !!wf.paymentReceivedAt },
      ];
      return { steps, progress: wf.paymentReceivedAt ? 1 : 0 };
    }
    case 'production': {
      const started = !!wf.productionStartedAt || f.attempts > 0;
      const madeAll = f.required > 0 && f.accepted >= f.required;
      const passed = wf.inspection && wf.inspection.passed === true;
      const steps = [
        { label: 'Scheduled / started', done: started },
        { label: 'Printing', done: f.attempts > 0 },
        { label: `Made ${f.accepted} of ${f.required}`, done: madeAll },
        { label: 'Inspection passed', done: !!passed },
      ];
      const printFrac = f.required > 0 ? Math.min(1, f.accepted / f.required) : 0;
      const progress = passed ? 1 : (started ? 0.1 + 0.8 * printFrac : 0);
      return { steps, progress };
    }
    case 'post-processing': {
      if (!f.ppRequired) {
        return { steps: [{ label: 'No post-processing needed', done: true }], progress: 1, skipped: true };
      }
      const done = !!wf.postProcessingDoneAt;
      return { steps: [{ label: 'Post-processing complete', done }], progress: done ? 1 : 0 };
    }
    case 'packaging': {
      const done = !!wf.readyForCollectionAt;
      return { steps: [{ label: 'Packed and ready for collection', done }], progress: done ? 1 : 0 };
    }
    case 'delivery': {
      const steps = [
        { label: 'Collected by courier', done: !!wf.collectedAt },
        { label: 'Delivered', done: !!wf.deliveredAt },
      ];
      return { steps, progress: (wf.collectedAt ? 0.5 : 0) + (wf.deliveredAt ? 0.5 : 0) };
    }
    case 'closeout': {
      const steps = [
        { label: 'Client feedback captured', done: !!wf.closeout },
        { label: 'Order closed', done: !!wf.closedAt },
      ];
      return { steps, progress: wf.closedAt ? 1 : (wf.closeout ? 0.6 : 0.2) };
    }
    default:
      return { steps: [], progress: phaseId === 'closed' ? 1 : 0 };
  }
}

/** The phase whose progress the order is really sitting at (sees through holds). */
function effectivePhase(project) {
  if (project.phase === 'on-hold') return project.onHoldFrom || 'quotation';
  if (project.phase === 'cancelled') return project.workflow?.cancelledFrom || 'quotation';
  return project.phase;
}

/** The next phase a job is expected to reach, skipping any that do not apply. */
function nextExpected(project, f) {
  const from = effectivePhase(project);
  let i = PHASE_ORDER.indexOf(from);
  if (i < 0) return null;
  for (i += 1; i < PHASE_ORDER.length; i += 1) {
    if (PHASE_ORDER[i] === 'post-processing' && !f.ppRequired) continue;
    return PHASE_ORDER[i];
  }
  return null;
}

/* ------------------------------------------------- actions per phase ------ */

function actionsFor(project) {
  const phase = project.phase;
  if (phase === 'on-hold') return [{ id: 'resume', label: 'Resume order', primary: true, tone: 'ok' }];
  if (phase === 'closed') return [];
  if (phase === 'cancelled') return [{ id: 'resume-cancel', label: 'Reopen order', tone: 'ok' }];

  const hasQuote = (project.quotes || []).length > 0;
  const wf = project.workflow || defaultWorkflow();
  const main = [];
  switch (phase) {
    case 'quotation':
      main.push({ id: 'send-quote', label: hasQuote ? 'Send quotation' : 'Create and send quotation', primary: true });
      main.push({ id: 'return-to-client', label: 'Issue — return to client', tone: 'warn' });
      break;
    case 'awaiting-payment':
      main.push({ id: 'payment-received', label: 'Payment received', primary: true, tone: 'ok' });
      break;
    case 'production':
      if (!wf.productionStartedAt) main.push({ id: 'start-production', label: 'Mark production started' });
      main.push({ id: 'inspection-pass', label: 'Passed inspection — complete production', primary: true, tone: 'ok' });
      main.push({ id: 'reprint', label: 'Failed — reprint needed', tone: 'warn' });
      break;
    case 'post-processing':
      main.push({ id: 'post-processing-done', label: 'Post-processing done', primary: true });
      break;
    case 'packaging':
      main.push({ id: 'ready-for-collection', label: 'Packed — ready for collection', primary: true });
      break;
    case 'delivery':
      if (!wf.collectedAt) main.push({ id: 'confirm-collected', label: 'Courier collected it', primary: true });
      else main.push({ id: 'confirm-delivered', label: 'Confirm delivered', primary: true, tone: 'ok' });
      break;
    case 'closeout':
      main.push({ id: 'record-feedback', label: 'Record client feedback' });
      main.push({ id: 'close-order', label: 'Close order', primary: true });
      break;
    default:
      break;
  }
  // Step back a phase — available wherever there is a phase behind this one.
  if (phase !== 'quotation') main.push({ id: 'back', label: '← Back a phase' });
  // On-hold and Cancel are available from every active phase.
  main.push({ id: 'hold', label: 'Put on hold' });
  main.push({ id: 'cancel', label: 'Cancel order', tone: 'danger' });
  return main;
}

/** Everything a screen needs to draw the workflow for one order. */
export function workflowState(project) {
  const f = facts(project);
  const eff = effectivePhase(project);
  const detail = phaseDetail(project, eff, f);

  let done = 0;
  let total = 0;
  const curIdx = PHASE_ORDER.indexOf(eff);
  for (const ph of PHASES) {
    total += ph.weight;
    const d = phaseDetail(project, ph.id, f);
    const idx = PHASE_ORDER.indexOf(ph.id);
    if (d.skipped) { done += ph.weight; continue; }
    if (idx < curIdx) done += ph.weight;
    else if (idx === curIdx) done += ph.weight * d.progress;
  }
  let overall = total ? done / total : 0;
  if (project.phase === 'closed') overall = 1;

  const next = nextExpected(project, f);
  return {
    phase: { id: project.phase, name: phaseName(project.phase) },
    effectivePhase: eff,
    facts: f,
    steps: detail.steps,
    phaseProgress: detail.progress,
    skipped: !!detail.skipped,
    overallProgress: overall,
    actions: actionsFor(project),
    nextExpected: next ? { id: next, name: phaseName(next) } : null,
    blocked: project.phase === 'awaiting-payment',
    terminal: project.phase === 'closed' || project.phase === 'cancelled',
    onHold: project.phase === 'on-hold',
  };
}

/* --------------------------------------------------------- transitions ---- */

const now = () => nowIso();

const TRANSITIONS = {
  'return-to-client': (p, { note = '' } = {}) => ({
    workflow: { quoteIssue: { note, at: now() } },
    event: { type: 'returned-to-client', text: note ? `Returned to client: ${note}` : 'Returned to client for clarification' },
  }),
  'send-quote': (p) => ({
    phase: 'awaiting-payment',
    workflow: { quoteIssue: null },
    event: { type: 'quote-sent', text: 'Quotation sent to the client', phaseFrom: p.phase, phaseTo: 'awaiting-payment' },
  }),
  'payment-received': (p) => ({
    phase: 'production',
    workflow: { paymentReceivedAt: now() },
    event: { type: 'payment-received', text: 'Payment received — order approved for production', phaseFrom: p.phase, phaseTo: 'production' },
  }),
  'start-production': (p) => ({
    workflow: { productionStartedAt: p.workflow?.productionStartedAt || now() },
    event: { type: 'production-started', text: 'Production started' },
  }),
  'inspection-pass': (p) => {
    const to = postProcessingRequired(p) ? 'post-processing' : 'packaging';
    return {
      phase: to,
      workflow: { inspection: { passed: true, at: now() } },
      event: { type: 'inspection-passed', text: `Inspection passed — moving to ${phaseName(to)}`, phaseFrom: p.phase, phaseTo: to },
    };
  },
  reprint: (p, { note = '' } = {}) => ({
    workflow: { inspection: { passed: false, at: now(), note } },
    event: { type: 'reprint-needed', text: note ? `Reprint needed: ${note}` : 'Reprint needed — parts failed inspection' },
  }),
  'post-processing-done': (p) => ({
    phase: 'packaging',
    workflow: { postProcessingDoneAt: now() },
    event: { type: 'post-processing-done', text: 'Post-processing complete', phaseFrom: p.phase, phaseTo: 'packaging' },
  }),
  'ready-for-collection': (p) => ({
    phase: 'delivery',
    workflow: { readyForCollectionAt: now() },
    event: { type: 'ready-for-collection', text: 'Packaged and ready for collection', phaseFrom: p.phase, phaseTo: 'delivery' },
  }),
  'confirm-collected': () => ({
    workflow: { collectedAt: now() },
    event: { type: 'collected', text: 'Collected by the courier' },
  }),
  'confirm-delivered': (p) => ({
    phase: 'closeout',
    workflow: { deliveredAt: now() },
    event: { type: 'delivered', text: 'Delivered to the client', phaseFrom: p.phase, phaseTo: 'closeout' },
  }),
  'record-feedback': (p, { feedback = {} } = {}) => ({
    workflow: { closeout: { ...feedback, at: now() } },
    event: { type: 'closeout-feedback', text: 'Client feedback recorded' },
  }),
  'close-order': (p) => ({
    phase: 'closed',
    workflow: { closedAt: now() },
    event: { type: 'closed', text: 'Order closed', phaseFrom: p.phase, phaseTo: 'closed' },
  }),
  hold: (p) => (p.phase === 'on-hold' ? {} : {
    phase: 'on-hold',
    holdFrom: p.phase,
    event: { type: 'on-hold', text: 'Order put on hold', phaseFrom: p.phase, phaseTo: 'on-hold' },
  }),
  resume: (p) => ({
    phase: p.onHoldFrom || 'quotation',
    clearHold: true,
    event: { type: 'resumed', text: 'Order resumed', phaseFrom: 'on-hold', phaseTo: p.onHoldFrom || 'quotation' },
  }),
  cancel: (p, { note = '' } = {}) => ({
    phase: 'cancelled',
    workflow: { cancelledFrom: p.phase },
    event: { type: 'cancelled', text: note ? `Order cancelled: ${note}` : 'Order cancelled', phaseFrom: p.phase, phaseTo: 'cancelled' },
  }),
  'resume-cancel': (p) => ({
    phase: p.workflow?.cancelledFrom || 'quotation',
    workflow: { cancelledFrom: null },
    event: { type: 'reopened', text: 'Order reopened', phaseFrom: 'cancelled', phaseTo: p.workflow?.cancelledFrom || 'quotation' },
  }),
  // Step back to the previous phase, reopening its decision by clearing the
  // marker that had advanced INTO the current one — so a job pulled back out of
  // Packaging shows Production as unfinished again, not still at 100%.
  back: (p) => {
    const cur = effectivePhase(p);
    const i = PHASE_ORDER.indexOf(cur);
    if (i <= 0) return {};
    const pp = postProcessingRequired(p);
    let j = i - 1;
    while (j >= 0 && PHASE_ORDER[j] === 'post-processing' && !pp) j -= 1;
    if (j < 0) return {};
    const prev = PHASE_ORDER[j];
    const clearOnLeaving = {
      'awaiting-payment': {},
      production: { paymentReceivedAt: null },
      'post-processing': { inspection: null },
      packaging: pp ? { postProcessingDoneAt: null } : { inspection: null },
      delivery: { readyForCollectionAt: null },
      closeout: { deliveredAt: null },
    };
    return {
      phase: prev,
      workflow: clearOnLeaving[cur] || {},
      event: { type: 'stepped-back', text: `Stepped back to ${phaseName(prev)}`, phaseFrom: p.phase, phaseTo: prev },
    };
  },
};

/** Apply a workflow action, returning a new project (pure). */
export function advance(project, actionId, payload = {}) {
  const handler = TRANSITIONS[actionId];
  if (!handler) return project;
  const res = handler(project, payload) || {};

  let next = { ...project, modifiedAt: now() };
  if (res.workflow) next.workflow = { ...(project.workflow || defaultWorkflow()), ...res.workflow };
  if (res.phase) { next.phase = res.phase; next.status = statusFromPhase(res.phase); }
  if (res.holdFrom) next.onHoldFrom = res.holdFrom;
  if (res.clearHold) next.onHoldFrom = null;
  if (res.event) {
    const { type, text, ...meta } = res.event;
    next = logEvent(next, type, text, meta);
  }
  return next;
}

/* --------------------------------------------- client progress update ----- */

/**
 * A plain-text progress note for the customer, built from the current workflow
 * state. Manual for now — copied into an email or a message — but written so a
 * future version can fire it automatically when a phase advances.
 */
export function clientProgressReport(project, ws, { company = {}, customerName = '' } = {}) {
  const eff = ws.effectivePhase;
  const curIdx = PHASE_ORDER.indexOf(eff);
  const completed = PHASES.filter((p, i) => i < curIdx).map((p) => p.name);
  const pct = Math.round(ws.overallProgress * 100);

  const current = ws.terminal
    ? phaseName(project.phase)
    : (ws.onHold ? `On hold (was ${phaseName(eff)})` : ws.phase.name);

  const lines = [
    `Progress update${company.name ? ` — ${company.name}` : ''}`,
    '',
    `Order: ${project.name || 'your order'}`,
    customerName ? `For: ${customerName}` : '',
    '',
    `Current stage: ${current}`,
    `Overall progress: ${pct}%`,
    completed.length ? `Completed: ${completed.join(', ')}` : 'Completed: just getting started',
    ws.steps && ws.steps.length
      ? `Right now: ${(ws.steps.find((s) => !s.done) || ws.steps[ws.steps.length - 1]).label}`
      : '',
    ws.nextExpected ? `Next: ${ws.nextExpected.name}` : (project.phase === 'closed' ? 'This order is complete.' : ''),
    '',
    'We will keep you posted as it progresses.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}
