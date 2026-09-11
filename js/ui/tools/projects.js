/**
 * Projects: parts, production records and what actually happened.
 *
 * The list is one screen and an open project is another. Every edit goes
 * through the pure helpers in js/projects.js, which return new objects - so
 * the revision history is real rather than implied.
 */

import { el, toast } from '../dom.js';
import {
  section, subsection, numberField, textField, selectField, checkField, button,
  buttonRow, banner, statTile, table, muted, emptyState, pill, costRow, noticeStack,
  sliderField, moneyField,
} from '../controls.js';
import { moneyDiagram } from '../svg/money.js';
import { bedPlan, bedTowerFootprint } from '../svg/bed.js';
import { explainLine, explainOrder } from '../explain.js';
import { downloadJson, downloadCsv, orderCsv, copyText } from '../export.js';
import { readMesh } from '../../mesh.js';
import { platformInflate } from '../../zip.js';
import { analyse, fmtSize, mm3ToCm3 } from '../../geometry.js';
import { calculateOrder } from '../../engine.js';
import { filamentSlots } from '../filament-slots.js';
import { reconcileSlots, defaultSlots, normaliseMix } from '../../filaments.js';
import { findMaterial, materialLabel } from '../../materials.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import {
  makeProject, makePart, makeCustomer, addPart, updatePart, removePart, duplicatePart,
  duplicateProject, recordAttempt, removeAttempt, partStats, orderFromProject, logEvent,
} from '../../projects.js';
import {
  workflowState, advance, clientProgressReport, phaseName, PHASES, isInternal, displayPhase,
  phaseSkipped, isCompanyInternal,
} from '../../workflow.js';
import {
  makeQuote, invoiceFromQuote, recordPayment, agreeTotal, lockedPricing,
} from '../../documents.js';
import { gateMatches, entryPostOps } from '../../postprocessing.js';
import { INFILL_PATTERNS, FACTOR_LABELS } from '../../profiles.js';
import { ESTIMATE_LEVELS } from '../../estimate.js';
import { slotLimit } from '../../printers.js';
import { partColourPlan, swapCost } from '../../colourplan.js';
import {
  movementsForRun, materialStock, resinStock, resinGramsForPart, resinItemFor, makeMovement,
} from '../../inventory.js';
import { nextNumber } from '../../settings.js';
import {
  state, replaceProject, removeProject, activeProject, activePart, saveSoon,
  customerFor, exportProject,
} from '../../state.js';

export const id = 'projects';
export const name = 'Projects';
export const short = 'Projects';

const commit = (project) => { replaceProject(project); };

function priceProject(project, settings) {
  const customer = customerFor(project);
  return calculateOrder(orderFromProject(project, { customer }), settings,
    { internal: isInternal(project), companyInternal: isCompanyInternal(project) });
}

/* ------------------------------------------------ shared document actions -- */

/**
 * Create a quote from the current pricing and return the project with it added
 * and the event logged. Does NOT change the phase — the caller (the send-quote
 * action) advances the workflow once the quote exists.
 */
function createQuote(project, result) {
  const settings = state.settings;
  const { number, numbering } = nextNumber(settings, 'quote');
  settings.numbering = numbering;
  const quote = makeQuote({
    number,
    project,
    customer: customerFor(project),
    result,
    order: orderFromProject(project),
    settings,
  });
  state.activeDocumentId = quote.id;
  toast(`Quote ${number} created`);
  return logEvent({ ...project, quotes: [...project.quotes, quote] }, 'quote-created', `Quote ${number} created`);
}

/**
 * Raise the invoice for the latest quote and mark it paid — payment is the
 * client's acceptance. Returns the project with the invoice added and logged.
 */
function createPaidInvoice(project) {
  const settings = state.settings;
  const quote = project.quotes[project.quotes.length - 1];
  if (!quote) return project;
  const { number, numbering } = nextNumber(settings, 'invoice');
  settings.numbering = numbering;
  const issued = invoiceFromQuote(quote, { number, dueDays: 14 });
  const invoice = recordPayment(issued, issued.total);
  state.activeDocumentId = invoice.id;
  toast(`Invoice ${number} — recorded paid`);
  return logEvent({ ...project, invoices: [...project.invoices, invoice] }, 'invoice-paid',
    `Invoice ${number} issued and marked paid`);
}

/** The pill tone for a phase, so a phase reads at a glance in a list. */
function phaseTone(phase) {
  switch (phase) {
    case 'closeout':
    case 'closed': return 'ok';
    case 'awaiting-payment':
    case 'production':
    case 'on-hold': return 'warn';
    case 'cancelled': return 'danger';
    default: return 'info';
  }
}

/* ----------------------------------------------------------------- list -- */

function projectList(ctx) {
  const { rerender } = ctx;
  const projects = state.projects;

  if (!projects.length) {
    return [emptyState(
      'No projects yet. Price something on the Estimate tab and save it, or start an '
      + 'empty project here.',
      button('Start a project', () => newProject(rerender), { primary: true, key: 'new-project' }),
    )];
  }

  const rows = projects.map((project) => {
    const result = priceProject(project, state.settings);
    const stats = project.parts.map(partStats);
    return {
      project,
      result,
      accepted: stats.reduce((t, s) => t + s.accepted, 0),
      printed: stats.reduce((t, s) => t + s.printed, 0),
    };
  }).sort((a, b) => (b.project.modifiedAt || '').localeCompare(a.project.modifiedAt || ''));

  const code = state.settings.currencyCode;

  return [
    el('div', { class: 'panel__head' }, [
      el('h2', { text: `${projects.length} project${projects.length === 1 ? '' : 's'}` }),
      button('New project', () => newProject(rerender), { primary: true, key: 'new-project' }),
    ]),
    table([
      {
        label: 'Project',
        get: (r) => button(r.project.name, () => {
          state.activeProjectId = r.project.id;
          state.activePartId = r.project.parts[0]?.id || null;
          saveSoon();
          rerender();
        }, { key: `open-${r.project.id}` }),
      },
      { label: 'Customer', get: (r) => r.project.customerName || customerFor(r.project)?.name || '—' },
      { label: 'Phase', get: (r) => pill(phaseName(displayPhase(r.project)), phaseTone(displayPhase(r.project))) },
      { label: 'Parts', align: 'right', mono: true, get: (r) => String(r.project.parts.length) },
      { label: 'Printed', align: 'right', mono: true, get: (r) => `${r.accepted}/${r.printed}` },
      { label: 'CTC', align: 'right', mono: true, get: (r) => fmtMoney(r.result.totals.costToCompany, code) },
      { label: 'Invoice', align: 'right', mono: true, get: (r) => fmtMoney(r.result.totals.finalInvoice, code) },
      {
        label: '',
        get: (r) => button('Delete', () => {
          if (!window.confirm(`Delete “${r.project.name}” for good? This cannot be undone.`)) return;
          removeProject(r.project.id);
          toast('Project deleted');
          rerender();
        }, { key: `delete-${r.project.id}`, danger: true }),
      },
    ], rows),
  ];
}

function newProject(rerender) {
  const project = addPart(makeProject(), makePart({ printerId: state.settings.defaultPrinterId }));
  commit(project);
  state.activeProjectId = project.id;
  state.activePartId = project.parts[0].id;
  rerender();
}

/* -------------------------------------------------------------- project -- */

function projectHeader(ctx, project, result) {
  const { rerender } = ctx;
  const code = result.currencyCode;

  // Once a project has been invoiced its price is settled: the numbers come off
  // the invoice, frozen, and later changes to the labour rate or the material
  // costs must not move them. The live estimate is still computed and shown
  // underneath, but only as today's comparison.
  const locked = lockedPricing(project.invoices);
  const ctc = locked ? locked.costToCompany : result.totals.costToCompany;
  const partPrice = locked ? locked.partPrice : result.totals.partPrice;
  const finalInvoice = locked ? locked.finalInvoice : result.totals.finalInvoice;
  const margin = partPrice > 0 ? (partPrice - ctc) / partPrice : 0;

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('div', {}, [
        el('h2', { text: project.name }),
        el('p', { class: 'muted', text: `${project.number || 'unnumbered'} · `
          + `${project.customerName || customerFor(project)?.name || 'no customer'} · `
          + `modified ${new Date(project.modifiedAt).toLocaleDateString()}` }),
      ]),
      el('div', { class: 'btn-row' }, [
        locked ? pill(`Locked · ${locked.number}`, 'ok') : null,
        pill(phaseName(displayPhase(project)), phaseTone(displayPhase(project))),
        button('Back to the list', () => {
          state.activeProjectId = null;
          saveSoon();
          rerender();
        }, { key: 'close-project' }),
      ].filter(Boolean)),
    ]),
    el('div', { class: 'summary-grid' }, [
      statTile('Cost to Company', fmtMoney(ctc, code)),
      statTile('Part price', fmtMoney(partPrice, code), { tone: 'accent' }),
      statTile('Final invoice', fmtMoney(finalInvoice, code), { tone: 'ok' }),
      statTile('Machine time', `${result.capacity.machineHours.toFixed(1)} h`),
      statTile('Lead time', `${result.capacity.leadDays} days`),
      statTile('Margin', fmtRate(margin)),
    ]),
    locked
      ? muted(`Locked to invoice ${locked.number} of `
        + `${new Date(locked.at).toLocaleDateString()} — settings changes since then do not `
        + `affect it. Today’s live estimate would be `
        + `${fmtMoney(result.totals.finalInvoice, code)}.`)
      : null,
  ].filter(Boolean));
}

/** A labelled progress bar. Width is the only thing that changes, per render. */
function progressBar(label, fraction) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return el('div', { class: 'progressbar' }, [
    el('div', { class: 'progressbar__label' }, [
      el('span', { text: label }),
      el('span', { class: 'value', text: `${pct}%` }),
    ]),
    el('div', { class: 'progressbar__track' }, [
      el('div', { class: 'progressbar__fill', style: { width: `${pct}%` } }),
    ]),
  ]);
}

/** The phase strip: every phase, with the ones passed and the one current. */
function phaseStrip(project, eff) {
  const order = PHASES.map((p) => p.id);
  const curIdx = order.indexOf(eff);
  return el('div', { class: 'btn-row' }, PHASES.map((ph) => {
    // A phase that does not apply to this order reads muted, never as "done".
    if (phaseSkipped(project, ph.id)) return el('span', { class: 'muted', text: ph.name });
    if (ph.id === eff) return pill(ph.name, phaseTone(ph.id));
    if (curIdx >= 0 && order.indexOf(ph.id) < curIdx) return pill(ph.name, 'ok');
    return el('span', { class: 'muted', text: ph.name });
  }));
}

/** The order's automatic event history, newest first. */
function eventTimeline(project) {
  const events = [...(project.history || [])].reverse();
  if (!events.length) return muted('No events yet.');
  return el('ul', { class: 'doc-list' }, events.slice(0, 20).map((e) => el('li', {
    text: `${new Date(e.at).toLocaleDateString()} — ${e.text || e.to || e.type || 'event'}`,
  })));
}

/** A compact closeout feedback form, saved as one workflow action. */
function closeoutForm(project, rerender) {
  const draft = project.workflow?.closeout || {};
  const set = (patch) => {
    commit(advance(project, 'record-feedback', { feedback: { ...draft, ...patch } }));
    rerender();
  };
  return subsection('Client feedback', [
    checkField('cf-happy', 'Happy with the parts', !!draft.happy, (v) => set({ happy: v })),
    checkField('cf-more', 'Wants more prints', !!draft.wantsMore, (v) => set({ wantsMore: v })),
    checkField('cf-satisfied', 'Satisfied with the experience', !!draft.satisfied, (v) => set({ satisfied: v })),
    textField('cf-notes', 'Notes / anything to do differently', draft.notes || '',
      (v) => set({ notes: v }), { multiline: true }),
  ], { hint: 'Captured for the record. The order can be closed once the ~2-week window is done.' });
}

/**
 * The workflow panel: which phase the order is in, how far through it and the
 * whole order is, the short decision points, and only the actions that matter
 * now. The order walks quotation → awaiting payment → production →
 * post-processing → packaging → delivery → closeout; progress is read from what
 * has actually been recorded, not from ticking boxes.
 */
function workflowPanel(ctx, project, result) {
  const { rerender } = ctx;
  const settings = state.settings;
  const ws = workflowState(project);

  // Dispatch an action. A couple also touch documents; the rest are pure
  // transitions, with notes collected where the decision needs a reason.
  const run = (id) => {
    if (id === 'send-quote') {
      const withQuote = project.quotes.length ? project : createQuote(project, result);
      commit(advance(withQuote, 'send-quote'));
      rerender();
      return;
    }
    if (id === 'payment-received') {
      let p = project;
      // An expedited order skipped the quote, so raise one now from the current
      // pricing and lock it to the estimate the client actually paid.
      if (!p.quotes.length) p = createQuote(p, result);
      const agreed = p.workflow?.expedited ? p.workflow.expeditedTotal : null;
      if (agreed != null) {
        const last = p.quotes.length - 1;
        p = { ...p, quotes: p.quotes.map((q, i) => (i === last ? agreeTotal(q, agreed) : q)) };
      }
      const withInvoice = p.invoices.length ? p : createPaidInvoice(p);
      commit(advance(withInvoice, 'payment-received'));
      rerender();
      return;
    }
    if (id === 'return-to-client') {
      const note = window.prompt('What needs clarifying or correcting from the client?') || '';
      commit(advance(project, 'return-to-client', { note }));
      rerender();
      return;
    }
    if (id === 'reprint') {
      const note = window.prompt('What failed, and what needs reprinting?') || '';
      commit(advance(project, 'reprint', { note }));
      toast('Back to printing — record the reprints below');
      rerender();
      return;
    }
    if (id === 'cancel') {
      if (!window.confirm('Cancel this order? It can be reopened later.')) return;
      const note = window.prompt('Reason for cancelling (optional)') || '';
      commit(advance(project, 'cancel', { note }));
      rerender();
      return;
    }
    commit(advance(project, id));
    rerender();
  };

  // The awaiting-payment wait. An expedited order is one the client already paid
  // from the estimate — so it says "verify proof of payment" rather than "waiting".
  const expedited = project.workflow?.expedited;
  const expeditedAmt = project.workflow?.expeditedTotal;
  const paymentNote = ws.phase.id === 'awaiting-payment'
    ? (expedited
      ? banner('info', `Expedited — the client paid the estimate`
        + `${expeditedAmt != null ? ` of ${fmtMoney(expeditedAmt, result.currencyCode)}` : ''}. `
        + 'Verify their proof of payment, then “Payment received” raises the invoice for that '
        + 'figure and starts production.')
      : muted(project.invoices.length
        ? 'The quotation is issued. Record the payment when it arrives to approve production.'
        : 'The quotation is issued. When payment arrives, “Payment received” raises the paid '
          + 'invoice and starts production.'))
    : null;

  const quoteIssue = project.workflow?.quoteIssue
    ? banner('warn', `Returned to client: ${project.workflow.quoteIssue.note || 'awaiting clarification'}`)
    : null;

  const actionButtons = ws.actions
    .filter((a) => a.id !== 'record-feedback') // the closeout form saves feedback
    .map((a) => button(a.label, () => run(a.id), {
      key: `wf-${a.id}`, primary: a.primary, danger: a.tone === 'danger',
    }));

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: 'Workflow' }),
      pill(phaseName(displayPhase(project)), phaseTone(displayPhase(project))),
    ]),
    progressBar('Overall progress', ws.overallProgress),
    phaseStrip(project, ws.effectivePhase),

    ws.terminal
      ? muted(project.phase === 'closed'
        ? 'This order is closed.' : 'This order is cancelled — reopen it to carry on.')
      : progressBar(`${ws.phase.name}${ws.onHold ? ' (on hold)' : ''}`, ws.phaseProgress),

    quoteIssue,
    paymentNote,

    ws.steps.length ? el('ul', { class: 'doc-list' }, ws.steps.map((s) => el('li', {
      text: `${s.done ? '✓' : '○'} ${s.label}`,
    }))) : null,

    ws.nextExpected && !ws.terminal
      ? muted(`Next: ${ws.nextExpected.name}`)
      : null,

    el('div', { class: 'btn-row' }, actionButtons),

    ws.phase.id === 'closeout' ? closeoutForm(project, rerender) : null,

    subsection('Client update', [
      buttonRow([button('Copy client progress update', () => {
        const customer = customerFor(project);
        copyText(clientProgressReport(project, ws, {
          company: settings.company,
          customerName: project.customerName || customer?.name || '',
        }));
        toast('Client update copied');
      }, { key: 'wf-client-update' })]),
    ], { hint: 'A short progress note for the customer, from the current stage.' }),

    subsection('Event history', [eventTimeline(project)]),
  ].filter(Boolean));
}

function partsPanel(ctx, project, result) {
  const { rerender } = ctx;
  const code = result.currencyCode;

  const rows = project.parts.map((part, index) => ({
    part,
    line: result.lines[index],
    stats: partStats(part),
  }));

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: 'Parts' }),
      button('Add a part', () => {
        commit(addPart(project, makePart({ printerId: state.settings.defaultPrinterId })));
        rerender();
      }, { key: 'add-part' }),
    ]),
    rows.length ? table([
      {
        label: 'Part',
        get: (r) => button(state.mode === 'simple'
          ? r.part.name
          : `${r.part.name} ${r.part.revision}`, () => {
          // Toggle: click the open part again to close its editor, so all can be
          // minimised and only one is ever open at a time.
          state.activePartId = state.activePartId === r.part.id ? null : r.part.id;
          saveSoon();
          rerender();
        }, { key: `part-${r.part.id}`, pressed: state.activePartId === r.part.id }),
      },
      { label: 'Profile', get: (r) => r.line?.profile.name || '—' },
      { label: 'Printer', get: (r) => r.line?.printer.name || '—' },
      { label: 'Qty', align: 'right', mono: true, get: (r) => String(r.part.quantity) },
      { label: 'Each', align: 'right', mono: true, get: (r) => `${r.line?.estimate.grams.toFixed(1) ?? '—'} g` },
      { label: 'CTC', align: 'right', mono: true, get: (r) => fmtMoney(r.line?.ctc ?? 0, code) },
      { label: 'Price', align: 'right', mono: true, get: (r) => fmtMoney(r.line?.unitPrice ?? 0, code) },
      {
        label: 'Made',
        align: 'right',
        get: (r) => (r.stats.hasData
          ? `${r.stats.accepted}/${r.stats.printed}`
          : muted('—')),
      },
      {
        label: '',
        get: (r) => button('Remove', () => {
          if (!window.confirm(`Remove ${r.part.name} from this project?`)) return;
          commit(removePart(project, r.part.id));
          if (state.activePartId === r.part.id) state.activePartId = null;
          rerender();
        }, { key: `list-remove-${r.part.id}`, danger: true }),
      },
    ], rows) : muted('No parts yet.'),
  ]);
}

function productionPanel(ctx, project, result) {
  const { rerender } = ctx;
  const part = activePart();
  if (!part) return null;
  const index = project.parts.findIndex((p) => p.id === part.id);
  const line = result.lines[index];
  const stats = partStats(part);
  const code = result.currencyCode;

  const rows = part.attempts.map((attempt) => ({
    attempt,
    when: new Date(attempt.at).toLocaleDateString(),
  }));

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: `Production — ${part.name}` }),
      button('Record a print', () => {
        const attempt = {
          // The effective printer: the project bed unless this part is an override.
          // (A part's own `printerId` is only meaningful when it overrides.)
          printerId: part.printerOverride ? part.printerId : project.printerId,
          materialId: part.materialId,
          quantity: Math.min(part.quantity, line?.perPlate || 1),
          accepted: Math.min(part.quantity, line?.perPlate || 1),
          rejected: 0,
          minutes: Math.round((line?.estimate.minutes || 0) * Math.min(part.quantity, line?.perPlate || 1)),
          grams: Number(((line?.estimate.grams || 0) * Math.min(part.quantity, line?.perPlate || 1)).toFixed(1)),
          estimatedMinutes: Math.round((line?.estimate.minutes || 0) * Math.min(part.quantity, line?.perPlate || 1)),
          estimatedGrams: Number(((line?.estimate.grams || 0) * Math.min(part.quantity, line?.perPlate || 1)).toFixed(1)),
          costPerAttempt: line?.ctc || 0,
        };
        const withRun = recordAttempt(project, part.id, attempt);
        // Book it against the attempt just created (with its id), so deleting
        // that print later can find and reverse exactly these movements.
        const created = withRun.parts.find((p) => p.id === part.id).attempts.at(-1);
        const next = logEvent(withRun, 'print-recorded',
          `Print recorded for ${part.name} — ${created.accepted} accepted`);
        commit(next);
        // Stock follows production, and only production. Passing inventory lets
        // the filament and component draws land on the real stock items (the
        // spool in use, the tracked component), so their on-hand counts fall.
        const movements = movementsForRun({
          project: next, part, attempt: created, result: line,
          settings: state.settings, inventory: state.inventory,
        });
        state.inventory.movements.push(...movements);
        // A resined part draws resin from a bottle in stock, if one is tracked.
        // resinGramsForPart returns 0 unless the resin-coat step is selected, so
        // the >0 check is the real gate.
        const size = part.orientedSize || part.geometry?.size;
        const resinG = resinGramsForPart(part, size, state.settings) * Math.max(0, num(created.accepted));
        const bottle = resinG > 0 ? resinItemFor(state.inventory) : null;
        if (bottle && resinG > 0) {
          state.inventory.movements.push(makeMovement({
            itemId: bottle.id,
            reason: created.failed ? 'scrap' : 'production',
            quantity: -resinG,
            projectId: next.id,
            partId: part.id,
            runId: created.id,
            note: `Resin on ${part.name}`,
          }));
        }
        saveSoon();
        toast('Print recorded — correct the actual figures below');
        rerender();
      }, { primary: true, key: 'record-print' }),
    ]),

    stats.hasData ? el('div', { class: 'summary-grid' }, [
      statTile('Printed', String(stats.printed)),
      statTile('Accepted', String(stats.accepted)),
      statTile('Rejected', String(stats.rejected), { tone: stats.rejected ? 'warn' : null }),
      statTile('Rejection rate', stats.rejectionRate == null ? '—' : fmtRate(stats.rejectionRate)),
      statTile('Time vs estimate', stats.timeRatio == null ? '—' : `${stats.timeRatio.toFixed(2)}×`,
        { hint: stats.timeRatio > 1.1 ? 'slower than estimated' : null }),
      statTile('Material vs estimate', stats.materialRatio == null ? '—' : `${stats.materialRatio.toFixed(2)}×`),
      statTile('Cost per accepted', stats.costPerAccepted == null ? '—'
        : fmtMoney(stats.costPerAccepted, code)),
    ]) : muted('No prints recorded yet. Once there are a few, the app starts correcting '
      + 'its own estimates from what actually happened.'),

    rows.length ? table([
      { label: 'When', key: 'when' },
      { label: 'Qty', align: 'right', mono: true, get: (r) => String(r.attempt.quantity) },
      {
        label: 'Accepted',
        align: 'right',
        get: (r) => numberField(`acc-${r.attempt.id}`, '', r.attempt.accepted, (v) => {
          r.attempt.accepted = Math.max(0, num(v));
          commit({ ...project });
          rerender();
        }, { min: 0, step: 1 }),
      },
      {
        label: 'Rejected',
        align: 'right',
        get: (r) => numberField(`rej-${r.attempt.id}`, '', r.attempt.rejected, (v) => {
          r.attempt.rejected = Math.max(0, num(v));
          commit({ ...project });
          rerender();
        }, { min: 0, step: 1 }),
      },
      {
        label: 'Minutes',
        align: 'right',
        get: (r) => numberField(`min-${r.attempt.id}`, '', r.attempt.minutes, (v) => {
          r.attempt.minutes = Math.max(0, num(v));
          commit({ ...project });
          rerender();
        }, { min: 0 }),
      },
      {
        label: 'Grams',
        align: 'right',
        get: (r) => numberField(`g-${r.attempt.id}`, '', r.attempt.grams, (v) => {
          r.attempt.grams = Math.max(0, num(v));
          commit({ ...project });
          rerender();
        }, { min: 0 }),
      },
      {
        label: 'Failed',
        get: (r) => checkField(`fail-${r.attempt.id}`, '', r.attempt.failed, (v) => {
          r.attempt.failed = v;
          commit({ ...project });
          rerender();
        }),
      },
      {
        label: 'Why',
        get: (r) => textField(`why-${r.attempt.id}`, '', r.attempt.failureReason, (v) => {
          r.attempt.failureReason = v;
          commit({ ...project });
        }, { placeholder: r.attempt.failed ? 'Root cause' : '' }),
      },
      {
        label: '',
        get: (r) => button('Delete', () => {
          if (!window.confirm('Delete this recorded print? The stock it used is put '
            + 'back.')) return;
          commit(logEvent(removeAttempt(project, part.id, r.attempt.id),
            'print-deleted', `Recorded print deleted from ${part.name}`));
          // This print did not happen, so its stock movements come back out
          // rather than being offset by a compensating return.
          state.inventory.movements = state.inventory.movements
            .filter((m) => m.runId !== r.attempt.id);
          saveSoon();
          toast('Print deleted — stock restored');
          rerender();
        }, { key: `del-run-${r.attempt.id}`, danger: true }),
      },
    ], rows, { compact: true }) : null,
  ]);
}

/* -------------------------------------------------------------- sidebar -- */

/**
 * The project bed: one printer and one set of loaded filament for the whole job,
 * the same shared-bed model the estimate uses. Every part prints on this by
 * default; a part opts onto a different machine from its own editor. Changing the
 * printer resets the loaded filament, since a different machine holds different
 * spools.
 */
function projectBedSection(project, settings, setProject) {
  const printer = settings.printers.find((p) => p.id === project.printerId) || settings.printers[0];
  const liveSlots = reconcileSlots(
    project.slots || defaultSlots(printer, null), printer, settings.materials,
  ).slots;
  return section('project-bed', 'Printer & loaded filament', [
    muted('One bed for the whole project — the printer and the spools loaded in it. Every part '
      + 'prints on this; move a single part to a different printer from its own editor if you '
      + 'must (the outlier).'),
    selectField('project-printer', 'Printer',
      settings.printers.filter((p) => !p.archived && (p.active !== false || p.id === project.printerId))
        .map((p) => ({ value: p.id, label: p.name + (p.active === false ? ' (under maintenance)' : '') })),
      project.printerId, (v) => setProject({ printerId: v, slots: null })),
    ...filamentSlots({
      printer,
      slots: liveSlots,
      materials: settings.materials,
      countryId: settings.countryId,
      currencyCode: settings.currencyCode,
      keyPrefix: `project-bed-${project.id}`,
      onSlots: (next) => setProject({ slots: next }),
    }),
  ]);
}

function projectSidebar(ctx, project, result) {
  const { rerender } = ctx;
  const settings = state.settings;
  const part = activePart();

  const setProject = (patch) => {
    commit({ ...project, ...patch });
    rerender();
  };

  const sections = [
    section('project', 'Project', [
      textField('project-name', 'Name', project.name, (v) => setProject({ name: v })),
      selectField('project-customer', 'Customer',
        [{ value: '', label: 'No customer' },
          ...state.customers.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))],
        project.customerId || '', (v) => setProject({ customerId: v || null })),
      buttonRow([button('New customer', () => {
        const customer = makeCustomer({ name: 'New customer' });
        state.customers.push(customer);
        setProject({ customerId: customer.id });
      }, { key: 'new-customer' })]),
      selectField('project-internal', 'Order type', [
        { value: 'off', label: 'Customer order' },
        { value: 'employee', label: 'Internal — for an employee (cost, they pay)' },
        { value: 'company', label: 'Internal — for the company (cost, an expense)' },
      ], project.internal || 'off', (v) => setProject({ internal: v }), {
        hint: 'Internal orders price at the physical cost — material, machine, electricity and '
          + 'hardware — with no labour and no profit, and they skip packaging and delivery. An '
          + 'employee order keeps the rejection and general allowances and is still quoted and paid '
          + 'at cost; a company order is a bare expense — it also drops those two allowances and '
          + 'goes straight to production, skipping the quote and payment.',
      }),
      textField('project-notes', 'Notes', project.notes, (v) => setProject({ notes: v }), { multiline: true }),
    ]),
    projectBedSection(project, settings, setProject),
  ];

  if (part) {
    sections.push(partSidebar(ctx, project, part));
  }

  sections.push(section('project-order', 'Order', [
    selectField('project-shipping', 'Delivery',
      [{ value: 'auto', label: 'Automatic — cheapest courier that carries the parcel' },
        ...settings.shipping.filter((s) => s.country === '*' || s.country === settings.countryId)
          .map((s) => ({ value: s.id, label: s.name }))],
      project.order.shippingMethodId,
      (v) => setProject({ order: { ...project.order, shippingMethodId: v } })),
    checkField('project-collect', 'Customer collects (pickup — no courier)', project.order.packagingCollected,
      (v) => setProject({ order: { ...project.order, packagingCollected: v } }), {
        hint: 'Still boxed for collection, but no courier and no Delivery phase — the client '
          + 'picks it up, then it goes to Closeout.',
      }),
    checkField('project-nopack', 'No packaging required', project.order.noPackaging,
      (v) => setProject({ order: { ...project.order, noPackaging: v } }), {
        hint: 'Hand the parts over as they come off the printer — skips the Packaging phase and '
          + 'its cost.',
      }),
  ], { open: false }));

  sections.push(section('project-docs', 'Quotes and invoices', [
    project.quotes.length || project.invoices.length
      ? el('ul', { class: 'doc-list' }, [
        ...project.quotes.map((q) => el('li', { text: `${q.number} · quote · ${fmtMoney(q.total, q.currencyCode)}` })),
        ...project.invoices.map((i) => el('li', { text: `${i.number} · invoice · ${fmtMoney(i.total, i.currencyCode)}` })),
      ])
      : muted('The quote is raised in the Workflow panel — “Create and send quotation” — and the '
        + 'invoice when you record payment. They then appear here.'),
  ], { open: false }));

  sections.push(section('project-export', 'Export', [
    buttonRow([
      button('Save this project', () => downloadJson(exportProject(project.id),
        project.name.replace(/\W+/g, '-').toLowerCase()), { key: 'export-project' }),
      button('CSV', () => downloadCsv(orderCsv(result), 'project'), { key: 'project-csv' }),
    ]),
    buttonRow([
      button('Duplicate', () => {
        const copy = duplicateProject(project);
        commit(copy);
        state.activeProjectId = copy.id;
        rerender();
      }, { key: 'duplicate-project' }),
    ]),
  ], { open: false }));

  return sections;
}

/**
 * The slicer figures for a project part: grams PER HEAD, and one total time.
 *
 * A multi-material job comes off the slicer with a weight for each head, so that
 * is what is entered here - one figure per loaded spool. The print time is one
 * number for the whole plate, not per head. Entered figures outrank the app's own
 * geometry, and per-head grams are costed each at their own plastic's price.
 */
function slicerFigures(part, liveSlots, settings, set) {
  const slicer = part.slicer || {};
  const headGrams = (slotId) => {
    const hit = (slicer.heads || []).find((h) => h.slotId === slotId);
    if (hit) return num(hit.grams);
    // An older part may carry a single flat grams figure; show it on the one head.
    if (liveSlots.length === 1 && slicer.grams != null) return num(slicer.grams);
    return 0;
  };
  const setHeadGrams = (slotId, grams) => {
    const heads = liveSlots.map((s) => ({
      slotId: s.id,
      grams: s.id === slotId ? Math.max(0, num(grams)) : headGrams(s.id),
    }));
    const total = heads.reduce((t, h) => t + h.grams, 0);
    set({ slicer: { ...slicer, heads, grams: total } });
  };

  const qty = Math.max(1, num(part.quantity, 1));
  const gramFields = liveSlots.map((s, i) => {
    const material = findMaterial(settings.materials, s.materialId);
    return numberField(`part-slicer-g-${part.id}-${i}`,
      liveSlots.length > 1 ? `${materialLabel(material)} — total` : 'Total material',
      headGrams(s.id), (v) => setHeadGrams(s.id, v), { min: 0, suffix: 'g' });
  });

  return subsection('Slicer figures', [
    muted(`Once you have sliced it, paste the slicer’s TOTALS for the whole print`
      + `${qty > 1 ? ` of all ${qty}` : ''} — the grams off each head and the total print `
      + 'time — not the figure per part. These outrank the app’s own geometry.'),
    ...gramFields,
    numberField(`part-slicer-min-${part.id}`, 'Total print time', slicer.minutes ?? 0,
      (v) => set({ slicer: { ...slicer, minutes: num(v) } }), { min: 0, suffix: 'min' }),
    // Which estimate to trust — the same control the estimator offers. Advanced+
    // only; Simple always uses the best available figure.
    state.mode !== 'simple'
      ? selectField(`part-estimate-method-${part.id}`, 'Which estimate to use',
        [{ value: 'auto', label: 'Best available (recommended)' },
          ...ESTIMATE_LEVELS.map((l) => ({ value: l.id, label: l.name }))],
        part.estimateMethod || 'auto', (v) => set({ estimateMethod: v }))
      : null,
  ].filter(Boolean), {
    hint: qty > 1
      ? `The whole print, not per part — the app divides across the ${qty} for you.`
      : 'The whole print as the slicer reports it.',
  });
}

/** The embedded components on one project part — add, change quantity, remove. */
function partComponents(part, settings, set) {
  const catalogue = settings.hardware.filter((h) => !h.archived);
  if (!catalogue.length) return null;
  const hardware = Array.isArray(part.hardware) ? part.hardware : [];
  // An after-print component is fitted by default; the operator can untick it.
  const defaultFit = (entry) => {
    const spec = catalogue.find((h) => h.id === entry.hardwareId);
    if (spec && spec.stage === 'after' && !('ops' in entry) && entry.fit === undefined) {
      entry.ops = { fit: true };
    }
    return entry;
  };

  const rows = hardware.map((entry, hi) => el('div', { class: 'row-editor' }, [
    selectField(`part-hw-${part.id}-${hi}`, 'Component',
      catalogue.map((h) => ({ value: h.id, label: h.name })),
      entry.hardwareId || catalogue[0].id, (v) => {
        const next = hardware.map((e, i) => (i === hi ? { ...e, hardwareId: v } : e));
        defaultFit(next[hi]);
        set({ hardware: next });
      }),
    numberField(`part-hwqty-${part.id}-${hi}`, 'Per part', entry.qty ?? 1,
      (v) => set({ hardware: hardware.map((e, i) => (i === hi ? { ...e, qty: Math.max(0, Math.round(num(v, 1))) } : e)) }),
      { min: 0, step: 1 }),
    button('Remove', () => set({ hardware: hardware.filter((_, i) => i !== hi) }),
      { key: `part-hwrm-${part.id}-${hi}`, danger: true }),
  ]));

  return subsection('Components', [
    hardware.length
      ? el('div', {}, rows)
      : muted('Magnets, nuts, inserts and NFC tags fitted during or after the print.'),
    buttonRow([button('Add a component', () => {
      set({ hardware: [...hardware, defaultFit({ hardwareId: catalogue[0].id, qty: 1 })] });
    }, { key: `part-hwadd-${part.id}` })]),
  ]);
}

/** Post-processing on one project part, read from the configurable operations. */
function partPostProcessing(part, settings, set) {
  const ops = settings.postProcessing?.ops || [];
  const catalogue = settings.hardware;
  const specOf = (e) => catalogue.find((h) => h.id === e.hardwareId);
  const hardware = Array.isArray(part.hardware) ? part.hardware : [];
  const matchesFor = (gate) => hardware
    .map((e, i) => ({ e, i, spec: specOf(e) }))
    .filter(({ e, spec }) => spec && num(e.qty, 1) > 0 && gateMatches(gate, spec));

  const setWhole = (opId, on) => {
    const m = { ...(part.postProcessing || {}) };
    if (on) m[opId] = true; else delete m[opId];
    set({ postProcessing: m });
  };
  const setComponent = (idx, opId, on) => {
    set({
      hardware: hardware.map((e, i) => {
        if (i !== idx) return e;
        const map = { ...(e.ops || {}) };
        if (on) map[opId] = true; else delete map[opId];
        const { fit, ...rest } = e;
        return { ...rest, ops: map };
      }),
    });
  };

  const body = [];
  for (const op of ops) {
    if (op.archived) continue;
    const gate = op.gate || { kind: 'always' };
    const matches = matchesFor(gate);
    if (op.perComponent) {
      for (const { e, i, spec } of matches) {
        const on = entryPostOps(e)[op.id] === true;
        body.push(checkField(`part-pp-${op.id}-${part.id}-${i}`, `${op.name} the ${spec.name.toLowerCase()}`,
          on, (v) => setComponent(i, op.id, v), {
            hint: on ? 'Assembled onto the part before it ships.' : 'Otherwise it ships loose in the box.',
          }));
      }
      continue;
    }
    if (gate.kind && gate.kind !== 'always' && matches.length === 0) continue;
    const on = (part.postProcessing || {})[op.id] === true;
    body.push(checkField(`part-pp-${op.id}-${part.id}`, op.name, on, (v) => setWhole(op.id, v), { hint: op.hint }));
    if (gate.kind === 'nfc' && on) {
      body.push(textField(`part-nfc-url-${part.id}`, 'Link to code onto the tag', part.nfcUrl || '',
        (v) => set({ nfcUrl: v }), { placeholder: 'https://…' }));
    }
  }
  if (!body.length) body.push(muted('Nothing to finish — this part ships straight off the printer.'));
  return section(`part-pp-${part.id}`, 'Post-processing', body, { open: false });
}

/**
 * The per-part print-setting overrides — the same "This part's settings" the
 * estimator offers, so a project part is a superset of both estimators. Overrides
 * are stored as a sparse `settingOverrides` diff against the chosen profile: a
 * value equal to the profile's is deleted, not stored, so the profile stays the
 * source of truth and only genuine departures are recorded. Hidden in Simple.
 */
function partSettingOverrides(part, settings, set) {
  if (state.mode === 'simple') return null;
  const profile = settings.profiles.find((p) => p.id === part.profileId) || settings.profiles[0];
  if (!profile) return null;
  const overrides = part.settingOverrides || {};
  const merged = { ...profile.settings, ...overrides };
  const overridden = Object.keys(overrides).length > 0;
  const setOverride = (field) => (value) => {
    const next = { ...overrides };
    if (value === profile.settings[field]) delete next[field];
    else next[field] = value;
    set({ settingOverrides: next });
  };

  return subsection('This part’s settings', [
    sliderField(`part-infill-${part.id}`, FACTOR_LABELS.infill, merged.infill, setOverride('infill'), {
      min: 0, max: 100, step: 1, format: (v) => `${v}%`,
    }),
    selectField(`part-infill-pattern-${part.id}`, FACTOR_LABELS.infillPattern,
      INFILL_PATTERNS.map((p) => ({ value: p.id, label: p.name })),
      merged.infillPattern, setOverride('infillPattern')),
    sliderField(`part-walls-${part.id}`, FACTOR_LABELS.wallLoops, merged.wallLoops, setOverride('wallLoops'), {
      min: 1, max: 12, step: 1, format: (v) => `${v}`,
    }),
    selectField(`part-layer-height-${part.id}`, FACTOR_LABELS.layerHeight,
      [0.08, 0.1, 0.12, 0.15, 0.16, 0.2, 0.24, 0.28, 0.3].map((h) => ({ value: String(h), label: `${h} mm` })),
      String(merged.layerHeight), (v) => setOverride('layerHeight')(Number(v))),
    checkField(`part-shrinkage-${part.id}`, FACTOR_LABELS.shrinkage, merged.shrinkage, setOverride('shrinkage')),
    checkField(`part-angle-opt-${part.id}`, FACTOR_LABELS.angleOptimisation, merged.angleOptimisation, setOverride('angleOptimisation')),
    checkField(`part-ironing-${part.id}`, FACTOR_LABELS.ironing, merged.ironing, setOverride('ironing')),
    checkField(`part-fuzzy-${part.id}`, FACTOR_LABELS.fuzzySkin, merged.fuzzySkin, setOverride('fuzzySkin')),
    checkField(`part-adaptive-${part.id}`, FACTOR_LABELS.adaptiveLayers, merged.adaptiveLayers, setOverride('adaptiveLayers'), {
      hint: 'Finer layers where the surface curves — a better finish for longer (about +15% time).',
    }),
    overridden
      ? buttonRow([button(`Back to the ${profile.name} profile`,
        () => set({ settingOverrides: {} }), { key: `part-reset-overrides-${part.id}` })])
      : null,
  ].filter(Boolean), {
    hint: overridden
      ? 'These differ from the saved profile. The quote records what was actually used.'
      : 'Changing anything here overrides the profile for this part only.',
  });
}

/**
 * The advanced per-part levers the estimator has and a project must not lose:
 * a parts-per-plate override, a labour-complexity multiplier and an other-direct
 * cost. The fields already ride into a project from an estimate — this is their
 * editor. Hidden in Simple.
 */
function partAdvanced(part, settings, set) {
  if (state.mode === 'simple') return null;
  return subsection('Advanced', [
    numberField(`part-per-plate-${part.id}`, 'Parts per plate', part.partsPerPlateOverride || 0,
      (v) => set({ partsPerPlateOverride: Math.max(0, Math.round(num(v))) }), {
        min: 0, step: 1, hint: 'Zero lets the app work it out from the shared bed.',
      }),
    sliderField(`part-complexity-${part.id}`, 'Labour complexity', part.complexity ?? 1,
      (v) => set({ complexity: v }), {
        min: 0.5, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`,
        info: 'Scales every labour operation for this part. Use it for something fiddly '
          + 'to remove, clean or inspect.',
      }),
    moneyField(`part-other-direct-${part.id}`, 'Other direct cost per part', part.otherDirectCost || 0,
      (v) => set({ otherDirectCost: num(v) }), settings.currencyCode),
  ]);
}

/**
 * Colour-change-by-height for one project part — the same per-part control the
 * estimate tool offers. Colours are bands up the part's height; the machine loads
 * the first few in its heads, and a colour beyond that is a hand swap at its
 * height (labour, a machine wait, no overnight run). Stored as `part.colourBands`;
 * every edit returns a new array through `set`.
 */
function partColourBands(part, settings, set, printer) {
  const limit = slotLimit(printer);
  const materials = settings.materials.filter((m) => !m.archived);
  const bands = Array.isArray(part.colourBands) ? part.colourBands : [];
  const label = (id) => {
    const m = settings.materials.find((x) => x.id === id);
    return m ? `${m.colour} ${m.name}` : id;
  };
  const plan = partColourPlan(bands, { heads: limit });
  const swap = swapCost(plan.swapCount, {
    swapLabourMinutes: settings.colour.swapLabourMinutes,
    swapWaitMinutes: settings.colour.swapWaitMinutes,
  });
  const setBand = (i, patch) => set({ colourBands: bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const bandRows = bands.map((b, i) => el('div', { class: 'row-editor' }, [
    selectField(`part-band-mat-${part.id}-${i}`, '',
      materials.map((m) => ({ value: m.id, label: `${m.colour} ${m.name}` })),
      b.materialId || materials[0]?.id, (v) => setBand(i, { materialId: v })),
    numberField(`part-band-upto-${part.id}-${i}`, '', b.upTo ?? '',
      (v) => setBand(i, { upTo: v == null || v === '' ? null : Math.max(0, num(v)) }),
      { min: 0, step: 1, suffix: 'mm to' }),
    button('Remove', () => set({ colourBands: bands.filter((_, j) => j !== i) }),
      { key: `part-band-rm-${part.id}-${i}`, danger: true }),
  ]));

  return subsection('Multi-colour (by height)', [
    muted(`Give this part its colours as bands up its height. ${printer.name} loads ${limit} at `
      + 'once; a colour beyond that is a hand swap at its height — labour, a machine wait, and no '
      + 'overnight run.'),
    bands.length ? el('div', {}, bandRows)
      : muted('No colour bands — this part prints in one colour.'),
    buttonRow([button('Add a band', () => set({
      colourBands: [...bands, { materialId: materials[0]?.id, upTo: null }],
    }), { key: `part-band-add-${part.id}` })]),
    plan.swapCount > 0
      ? banner('warn', `${plan.swapCount} hand swap${plan.swapCount === 1 ? '' : 's'} — this part `
        + `uses ${plan.colours.length} colours but ${printer.name} loads ${limit}. Adds `
        + `${swap.labourMinutes} min labour and ${swap.waitMinutes} min paused, and it can never `
        + 'run overnight.')
      : (bands.length ? muted(`All ${plan.colours.length} colours load in the heads — no hand swaps.`) : null),
    ...(plan.swapCount > 0
      ? plan.swaps.map((s) => muted(`at ${Math.round(num(s.atHeight))} mm: ${label(s.from)} → ${label(s.to)}`))
      : []),
  ].filter(Boolean), { open: bands.length > 0 });
}

function partSidebar(ctx, project, part) {
  const { rerender } = ctx;
  const settings = state.settings;
  // Read the freshest project each time: adding a head fires two updates in one
  // click (the new slot, and the mix reseeded to give it a share), and the
  // second must build on the first rather than on a stale closure.
  const set = (patch) => {
    const current = state.projects.find((p) => p.id === project.id) || project;
    commit(updatePart(current, part.id, patch));
    rerender();
  };

  // The effective printer and loaded filament: the project bed, unless this part
  // is an override onto its own machine. Colour bands, slicer heads and the model
  // all read from whichever this part actually prints on.
  const override = !!part.printerOverride;
  const effectivePrinterId = override ? part.printerId : project.printerId;
  const printer = settings.printers.find((p) => p.id === effectivePrinterId) || settings.printers[0];
  const effectiveSlots = override ? part.slots : project.slots;
  const liveSlots = reconcileSlots(
    effectiveSlots || defaultSlots(printer, part.materialId), printer, settings.materials,
  ).slots;

  const fileInput = el('input', {
    type: 'file',
    class: 'visually-hidden',
    accept: '.stl,.obj,.3mf',
    'data-field': `part-model-${part.id}`,
    on: {
      change: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const mesh = await readMesh(file.name, await file.arrayBuffer(), { inflate: platformInflate });
          set({ geometry: analyse(mesh), modelFileId: file.name });
          toast(`${file.name} measured`);
        } catch (error) {
          toast(error.message);
        }
      },
    },
  });

  // Components (embedded hardware) and post-processing, per part — the same
  // choices the estimate and the client form offer, so hardware can be added or
  // changed on a project directly, not only when it came in from an estimate.
  const componentsSection = partComponents(part, settings, set);
  const postProcessSection = partPostProcessing(part, settings, set);

  // The model goes at the TOP of the part editor: you load the model first, then
  // name it, set the quantity and the print intent from what it actually is.
  const modelSection = subsection('Model', [
    part.geometry
      ? el('dl', { class: 'facts' }, [
        el('dt', { text: 'Size' }), el('dd', { class: 'value', text: fmtSize(part.geometry.size) }),
        el('dt', { text: 'Volume' }), el('dd', { class: 'value', text: `${mm3ToCm3(part.geometry.volume).toFixed(2)} cm³` }),
      ])
      : muted('No model attached. The part is measured from its manual dimensions.'),
    buttonRow([
      button(part.geometry ? 'Replace the model' : 'Attach a model',
        () => fileInput.click(), { key: 'attach-model' }),
    ]),
    fileInput,
  ], { open: true });

  // Heading stays a simple position ("Part 1", "Part 2") — the name lives in the
  // Part name field below, so repeating it here just overflows the header.
  const partNo = project.parts.findIndex((p) => p.id === part.id) + 1;
  return section('part', `Part ${partNo > 0 ? partNo : ''}`.trim(), [
    modelSection,
    textField('part-name', 'Name', part.name, (v) => set({ name: v })),
    // Part number and revision are shop-drawing bookkeeping, not something a
    // quick estimate needs, so they only appear once past Simple.
    state.mode !== 'simple'
      ? el('div', { class: 'field-grid' }, [
        textField('part-number', 'Part number', part.partNumber, (v) => set({ partNumber: v })),
        textField('part-revision', 'Revision', part.revision, (v) => set({ revision: v })),
      ])
      : null,
    numberField('part-quantity', 'Quantity', part.quantity,
      (v) => set({ quantity: Math.max(1, Math.round(num(v, 1))) }), { min: 1, step: 1 }),
    selectField('part-profile', 'Print intent',
      settings.profiles.map((p) => ({ value: p.id, label: p.name })),
      // Choosing the Fit intent auto-ticks "must fit" (it can still be unticked);
      // leaving Fit clears it, since fit-critical only belongs with that intent.
      part.profileId, (v) => set({ profileId: v, settingOverrides: {}, mustFit: v === 'fit' })),
    partSettingOverrides(part, settings, set),
    // Fit-critical flag — only offered on the Fit intent, where it is on by default.
    part.profileId === 'fit'
      ? checkField('part-mustfit', 'This part must fit or mate with another part',
        !!part.mustFit, (v) => set({ mustFit: v }), {
          hint: 'On by default for the Fit intent. Untick if it does not have to meet set dimensions.',
        })
      : null,
    (part.profileId === 'fit' && part.mustFit)
      ? banner('info', 'Fit-critical: hold the critical dimensions and check there is a '
        + 'dimensioned drawing or a photo marking them. A printed part is only as accurate '
        + 'as the dimensions given.')
      : null,
    // Which machine this part prints on. By default it shares the project bed
    // (chosen once at the project level, so an assembly is set up once). Tick to
    // send this one part to a different printer — the outlier, priced on its own
    // machine and off the shared bed.
    checkField('part-printer-override', 'Print on a different printer', override,
      (v) => set({
        printerOverride: v,
        printerId: v ? project.printerId : part.printerId,
        slots: v ? project.slots : part.slots,
      }), {
        hint: override
          ? 'This part is on its own machine below, not the project bed.'
          : `Prints on the project bed (${printer.name}). Tick only to move this one part.`,
      }),
    override ? selectField('part-printer', 'Printer',
      settings.printers.filter((p) => !p.archived && (p.active !== false || p.id === part.printerId))
        .map((p) => ({ value: p.id, label: p.name + (p.active === false ? ' (under maintenance)' : '') })),
      part.printerId, (v) => set({ printerId: v, slots: null })) : null,
    // The override part's own loaded filament (the shared bed's is set once at the
    // project level). A project is priced from sliced grams, so no mix editor here.
    ...(override ? filamentSlots({
      printer,
      slots: liveSlots,
      materials: settings.materials,
      countryId: settings.countryId,
      currencyCode: settings.currencyCode,
      keyPrefix: `part-${part.id}`,
      onSlots: (next) => set({ slots: next, materialId: next[0]?.materialId || part.materialId }),
    }) : []),
    // No per-colour percentage split here: a project is priced from the slicer's
    // exact grams per head (below), not an estimate's guessed split. The colours a
    // part uses are set as bands up its height instead.
    partColourBands(part, settings, set, printer),

    componentsSection,
    postProcessSection,

    partAdvanced(part, settings, set),
    slicerFigures(part, liveSlots, settings, set),

    buttonRow([
      // Add another part without leaving the editor — the "Parts" panel in the
      // main view also has this, but an operator working in the sidebar could not
      // see it. Opens the new part straight away.
      button('Add another part', () => {
        const fresh = makePart({ printerId: settings.defaultPrinterId });
        commit(addPart(project, fresh));
        state.activePartId = fresh.id;
        rerender();
      }, { key: 'add-another-part' }),
      button('Duplicate this part', () => {
        commit(duplicatePart(project, part.id));
        rerender();
      }, { key: 'duplicate-part' }),
      button('Remove', () => {
        commit(removePart(project, part.id));
        state.activePartId = null;
        rerender();
      }, { key: 'remove-part', danger: true }),
    ]),
  ]);
}

/* ----------------------------------------------------------------- tool -- */

export function sidebar(ctx) {
  const project = activeProject();
  if (!project) return [];
  const result = priceProject(project, state.settings);
  return projectSidebar(ctx, project, result);
}

/**
 * Beds & layout for the whole project: how the shared-bed parts pack onto plates
 * (fewest plates for the machine's colour count), which parts sit on each, which
 * are on their own printer, and a build-volume picture of the selected part on its
 * plate. Reuses the estimate's bed split and plate renderer against the project's
 * shared bed.
 */
function bedLayoutPanel(ctx, project, result) {
  const { rerender } = ctx;
  const settings = state.settings;
  const printer = settings.printers.find((p) => p.id === project.printerId) || settings.printers[0];
  const limit = slotLimit(printer);

  const shared = project.parts.filter((p) => !p.printerOverride);
  const overrides = project.parts.filter((p) => p.printerOverride);

  // The mixed-part plate plan: every shared part positioned on the bed (with its
  // height, so the 3-D view is honest), so the operator sees which parts share each
  // plate and where. A multi-colour bed also books a purge tower.
  const footprintOf = (p) => p.orientedSize || p.geometry?.size || p.manual || null;
  // The loaded colours each part uses — the shared spools its mix draws from
  // (percent > 0) plus any colour-by-height bands. A plate books a purge tower only
  // when its parts span more than one, so a part set to a single colour needs none.
  const bedSlots = reconcileSlots(
    project.slots || defaultSlots(printer, null), printer, settings.materials,
  ).slots;
  const materialsOf = (p) => {
    const fromMix = normaliseMix(p.mix, bedSlots).entries
      .filter((e) => e.percent > 0)
      .map((e) => bedSlots.find((s) => s.id === e.slotId)?.materialId);
    const fromBands = Array.isArray(p.colourBands) ? p.colourBands.map((b) => b.materialId) : [];
    const ids = [...new Set([...fromMix, ...fromBands].filter(Boolean))];
    return ids.length ? ids : [p.materialId].filter(Boolean);
  };
  const planItems = shared
    .map((p) => ({ id: p.id, label: p.name, size: footprintOf(p), count: p.quantity, materials: materialsOf(p) }))
    .filter((it) => it.size && it.size.x && it.size.y);
  const plan = bedPlan(planItems, printer.build, {
    tower: bedTowerFootprint(settings, project.slots),
    printerName: printer.name,
    selectedIndex: num(state.ui.selectedBed, 0),
    onSelectBed: (i) => { state.ui.selectedBed = i; rerender(); },
  });

  return el('div', { class: 'panel' }, [
    // bedPlan renders the "Beds & layout" heading itself; show a plain one only when
    // there is nothing to lay out yet.
    plan || el('h3', { text: 'Beds & layout' }),
    plan || muted('Add parts with a size or a model to see the bed layout.'),
    muted(`${printer.name} holds ${limit} colour${limit === 1 ? '' : 's'} at once. Parts sharing the `
      + 'bed are laid out onto the fewest plates; a part moved to a different printer prints on its own. '
      + 'Click a bed to see it in 3-D.'),
    overrides.length
      ? muted(`On other printers: ${overrides.map((p) => `${p.name} — `
        + `${settings.printers.find((x) => x.id === p.printerId)?.name || '?'}`).join('; ')}.`)
      : null,
  ].filter(Boolean));
}

export function main(ctx) {
  const project = activeProject();
  if (!project) return projectList(ctx);

  const result = priceProject(project, state.settings);
  const code = result.currencyCode;

  const nodes = [projectHeader(ctx, project, result)];

  nodes.push(workflowPanel(ctx, project, result));

  nodes.push(...noticeStack(result.notes, {
    dismissed: state.ui.dismissedNotices || {},
    onDismiss: (k) => {
      state.ui.dismissedNotices = { ...(state.ui.dismissedNotices || {}), [k]: true };
      saveSoon();
      ctx.rerender();
    },
  }));

  // What this job needs off the shelf, and what has to be bought. Silent about
  // any material the workshop does not track.
  const need = new Map();
  for (const line of result.lines) {
    for (const f of line.filaments || []) {
      const id = f.material?.id;
      if (!id) continue;
      const grams = Math.max(0, num(f.grams)) * Math.max(1, num(line.quantity, 1));
      const cur = need.get(id) || { name: f.label || f.material?.name || 'filament', grams: 0 };
      cur.grams += grams;
      need.set(id, cur);
    }
  }
  const toBuy = [];
  for (const [id, entry] of need) {
    const s = materialStock(state.inventory, id, entry.grams);
    if (s.tracked && !s.enough) {
      toBuy.push(`${entry.name} — need ${entry.grams.toFixed(0)} g, have ${s.onHandG.toFixed(0)} g`);
    }
  }
  // Resin, across every resined part, checked against the bottles in stock.
  const resinNeed = project.parts.reduce((t, p) => t
    + resinGramsForPart(p, p.orientedSize || p.geometry?.size, state.settings)
      * Math.max(1, num(p.quantity, 1)), 0);
  if (resinNeed > 0) {
    const rs = resinStock(state.inventory, resinNeed);
    if (rs.tracked && !rs.enough) {
      toBuy.push(`Resin — need ${resinNeed.toFixed(0)} g, have ${rs.onHandG.toFixed(0)} g`);
    }
  }
  if (toBuy.length) {
    nodes.push(banner('warn', `Buy before this can be made: ${toBuy.join('; ')}.`));
  }

  nodes.push(partsPanel(ctx, project, result));

  if (result.lines.length) nodes.push(bedLayoutPanel(ctx, project, result));

  if (result.lines.length) {
    nodes.push(el('div', { class: 'viewport__stage' }, [
      moneyDiagram({
        currencyCode: code,
        title: 'This project — each bar to its own total',
        rows: [
          {
            name: 'Production',
            rows: [
              { label: 'Material', amount: sum(result.lines, (l) => l.production.material * l.quantity) },
              { label: 'Machine', amount: sum(result.lines, (l) => l.production.machine * l.quantity) },
              { label: 'Electricity', amount: sum(result.lines, (l) => l.production.electricity * l.quantity) },
              { label: 'Labour', amount: sum(result.lines, (l) => l.production.labour * l.quantity) },
              { label: 'Hardware', amount: sum(result.lines, (l) => l.production.hardware * l.quantity) },
              { label: 'Rejection allowance', amount: sum(result.lines, (l) => l.production.scrapAllowance * l.quantity) },
              { label: 'General allowance', amount: sum(result.lines, (l) => l.production.generalAllowance * l.quantity) },
            ],
          },
          {
            name: 'Part price',
            rows: [
              { label: 'Cost recovery', amount: sum(result.lines, (l) => l.price.recovery * l.quantity) },
              { label: 'Labour + growth', amount: sum(result.lines, (l) => l.price.commercial * l.quantity) },
              { label: 'Profit + capital', amount: sum(result.lines, (l) => l.price.profit * l.quantity) },
            ],
          },
          {
            name: 'Invoice',
            rows: [
              { label: 'Parts', amount: result.parts.total },
              { label: 'Packaging', amount: result.orderExtras.packaging },
              { label: 'Shipping', amount: result.orderExtras.shipping },
              { label: 'Other services', amount: result.orderExtras.extrasTotal },
              { label: state.settings.tax.name || 'Tax', amount: result.tax.tax },
            ],
          },
        ],
      }),
    ]));
  }

  nodes.push(productionPanel(ctx, project, result));

  if (state.mode !== 'simple' && result.lines.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'Order total' }),
      costRow('Parts', result.parts.total, code, { strong: true }),
      costRow('Packaging', result.orderExtras.packaging, code),
      costRow(result.shipping.free ? 'Shipping (free)' : 'Shipping', result.orderExtras.shipping, code),
      costRow('Net', result.totals.net, code, { strong: true }),
      result.tax.tax ? costRow(state.settings.tax.name, result.tax.tax, code) : null,
      costRow('Final invoice', result.totals.finalInvoice, code, { strong: true }),
    ]));
  }

  return nodes;
}

export function explain(ctx) {
  const project = activeProject();
  if (!project || !project.parts.length) return [];
  const result = priceProject(project, state.settings);
  const index = Math.max(0, project.parts.findIndex((p) => p.id === state.activePartId));
  const line = result.lines[index];
  if (!line) return [];
  return [...explainLine(line, result, state.settings), ...explainOrder(result, state.settings)];
}

const sum = (list, pick) => list.reduce((total, item) => total + num(pick(item)), 0);
