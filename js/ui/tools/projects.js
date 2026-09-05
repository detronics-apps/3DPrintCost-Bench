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
  buttonRow, banner, statTile, table, muted, emptyState, pill, costRow,
} from '../controls.js';
import { moneyDiagram } from '../svg/money.js';
import { explainLine, explainOrder } from '../explain.js';
import { downloadJson, downloadCsv, orderCsv } from '../export.js';
import { readMesh } from '../../mesh.js';
import { platformInflate } from '../../zip.js';
import { analyse, fmtSize, mm3ToCm3 } from '../../geometry.js';
import { calculateOrder } from '../../engine.js';
import { materialPickerWithAdd } from '../material-picker.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import {
  makeProject, makePart, makeCustomer, addPart, updatePart, removePart, duplicatePart,
  duplicateProject, setStatus, recordAttempt, removeAttempt, partStats, orderFromProject,
  PROJECT_STATUSES, statusOf,
} from '../../projects.js';
import { makeQuote, invoiceFromQuote, lockedPricing } from '../../documents.js';
import { movementsForRun, materialStock } from '../../inventory.js';
import { nextNumber } from '../../settings.js';
import {
  state, replaceProject, activeProject, activePart, saveSoon, customerFor, exportProject,
} from '../../state.js';

export const id = 'projects';
export const name = 'Projects';
export const short = 'Projects';

const commit = (project) => { replaceProject(project); };

function priceProject(project, settings) {
  const customer = customerFor(project);
  return calculateOrder(orderFromProject(project, { customer }), settings);
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
      { label: 'Status', get: (r) => pill(statusOf(r.project.status).name, statusOf(r.project.status).tone) },
      { label: 'Parts', align: 'right', mono: true, get: (r) => String(r.project.parts.length) },
      { label: 'Printed', align: 'right', mono: true, get: (r) => `${r.accepted}/${r.printed}` },
      { label: 'CTC', align: 'right', mono: true, get: (r) => fmtMoney(r.result.totals.costToCompany, code) },
      { label: 'Invoice', align: 'right', mono: true, get: (r) => fmtMoney(r.result.totals.finalInvoice, code) },
    ], rows),
  ];
}

function newProject(rerender) {
  const project = addPart(makeProject(), makePart());
  commit(project);
  state.activeProjectId = project.id;
  state.activePartId = project.parts[0].id;
  rerender();
}

/* -------------------------------------------------------------- project -- */

function projectHeader(ctx, project, result) {
  const { rerender } = ctx;
  const code = result.currencyCode;
  const status = statusOf(project.status);

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
        pill(status.name, status.tone),
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
        commit(addPart(project, makePart()));
        rerender();
      }, { key: 'add-part' }),
    ]),
    rows.length ? table([
      {
        label: 'Part',
        get: (r) => button(state.mode === 'simple'
          ? r.part.name
          : `${r.part.name} ${r.part.revision}`, () => {
          state.activePartId = r.part.id;
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
          printerId: part.printerId,
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
        const next = recordAttempt(project, part.id, attempt);
        commit(next);
        // Stock follows production, and only production. Book it against the
        // attempt that was just created (with its id), so deleting that print
        // later can find and reverse exactly these movements.
        const created = next.parts.find((p) => p.id === part.id).attempts.at(-1);
        const movements = movementsForRun({
          project: next, part, attempt: created, result: line, settings: state.settings,
        });
        state.inventory.movements.push(...movements);
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
          commit(removeAttempt(project, part.id, r.attempt.id));
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
      selectField('project-status', 'Status',
        PROJECT_STATUSES.map((s) => ({ value: s.id, label: s.name })),
        project.status, (v) => { commit(setStatus(project, v)); rerender(); }),
      textField('project-notes', 'Notes', project.notes, (v) => setProject({ notes: v }), { multiline: true }),
    ]),
  ];

  if (part) {
    sections.push(partSidebar(ctx, project, part));
  }

  sections.push(section('project-order', 'Order', [
    selectField('project-shipping', 'Delivery',
      [{ value: 'auto', label: 'Cheapest that fits' },
        ...settings.shipping.filter((s) => s.country === '*' || s.country === settings.countryId)
          .map((s) => ({ value: s.id, label: s.name }))],
      project.order.shippingMethodId,
      (v) => setProject({ order: { ...project.order, shippingMethodId: v } })),
    checkField('project-collect', 'Customer collects', project.order.packagingCollected,
      (v) => setProject({ order: { ...project.order, packagingCollected: v } })),
  ], { open: false }));

  sections.push(section('project-docs', 'Quote and invoice', [
    buttonRow([
      button('Create a quote', () => {
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
        commit(setStatus({ ...project, quotes: [...project.quotes, quote] }, 'quoted',
          `Quote ${number}`));
        state.activeDocumentId = quote.id;
        toast(`Quote ${number} created`);
        rerender();
      }, { primary: true, key: 'make-quote' }),
    ]),
    project.quotes.length ? buttonRow([
      button('Invoice the latest quote', () => {
        const quote = project.quotes[project.quotes.length - 1];
        const { number, numbering } = nextNumber(settings, 'invoice');
        settings.numbering = numbering;
        const invoice = invoiceFromQuote(quote, { number, dueDays: 14 });
        commit(setStatus({ ...project, invoices: [...project.invoices, invoice] }, 'invoiced',
          `Invoice ${number}`));
        state.activeDocumentId = invoice.id;
        state.tool = 'documents';
        toast(`Invoice ${number} created`);
        rerender();
      }, { key: 'make-invoice' }),
    ]) : muted('Create a quote first. It stores the assumptions it was priced under, so '
      + 'changing your settings later will not rewrite it.'),
    project.quotes.length || project.invoices.length
      ? el('ul', { class: 'doc-list' }, [
        ...project.quotes.map((q) => el('li', { text: `${q.number} · quote · ${fmtMoney(q.total, q.currencyCode)}` })),
        ...project.invoices.map((i) => el('li', { text: `${i.number} · invoice · ${fmtMoney(i.total, i.currencyCode)}` })),
      ])
      : null,
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
      button('Archive', () => { commit(setStatus(project, 'archived')); rerender(); },
        { key: 'archive-project' }),
    ]),
  ], { open: false }));

  return sections;
}

function partSidebar(ctx, project, part) {
  const { rerender } = ctx;
  const settings = state.settings;
  const set = (patch) => { commit(updatePart(project, part.id, patch)); rerender(); };

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

  return section('part', `Part — ${part.name}`, [
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
      part.profileId, (v) => set({ profileId: v, settingOverrides: {} })),
    selectField('part-printer', 'Printer',
      settings.printers.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
      part.printerId, (v) => set({ printerId: v })),
    ...materialPickerWithAdd({
      keyPrefix: 'part',
      materials: settings.materials,
      materialId: part.materialId,
      expectedType: settings.profiles.find((p) => p.id === part.profileId)?.settings.materialType,
      countryId: settings.countryId,
      currencyCode: settings.currencyCode,
      onChange: (id) => set({ materialId: id }),
      onAdd: (entry) => {
        settings.materials.push(entry);
        set({ materialId: entry.id });
      },
    }),
    numberField('part-colours', 'Colours', part.colours,
      (v) => set({ colours: Math.max(1, Math.min(6, Math.round(num(v, 1)))) }), { min: 1, max: 6, step: 1 }),

    subsection('Model', [
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
    ]),

    subsection('Slicer figures', [
      el('div', { class: 'field-grid' }, [
        numberField('part-slicer-g', 'Material', part.slicer?.grams ?? 0,
          (v) => set({ slicer: { ...(part.slicer || {}), grams: num(v) } }), { min: 0, suffix: 'g' }),
        numberField('part-slicer-min', 'Time', part.slicer?.minutes ?? 0,
          (v) => set({ slicer: { ...(part.slicer || {}), minutes: num(v) } }), { min: 0, suffix: 'min' }),
      ]),
    ], { hint: 'Paste the slicer’s own numbers and they outrank the app’s geometry.' }),

    buttonRow([
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

export function main(ctx) {
  const project = activeProject();
  if (!project) return projectList(ctx);

  const result = priceProject(project, state.settings);
  const code = result.currencyCode;

  const nodes = [projectHeader(ctx, project, result)];

  for (const note of result.notes) nodes.push(banner(note.level, note.text));

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
  if (toBuy.length) {
    nodes.push(banner('warn', `Buy before this can be made: ${toBuy.join('; ')}.`));
  }

  nodes.push(partsPanel(ctx, project, result));

  if (result.lines.length) {
    nodes.push(el('div', { class: 'viewport__stage' }, [
      moneyDiagram({
        currencyCode: code,
        title: 'This project on one scale',
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
