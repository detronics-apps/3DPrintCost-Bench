/**
 * Quotes and invoices.
 *
 * A document is a snapshot. Opening one shows what the customer was told, not
 * what today's settings would say - and where the two differ, the difference is
 * shown rather than silently applied.
 */

import { el, toast } from '../dom.js';
import {
  section, numberField, textField, selectField, button, buttonRow, table, muted,
  statTile, pill, banner, emptyState, chips, costRow,
} from '../controls.js';
import {
  displayStatus, outstanding, isOverdue, assumptionDrift, recordPayment, reprice,
  QUOTE_STATUSES, INVOICE_STATUSES, documentRows,
} from '../../documents.js';
import { buildPrintSheet, printSheet, downloadCsv, documentCsv, csvFilename } from '../export.js';
import { calculateOrder } from '../../engine.js';
import { orderFromProject } from '../../projects.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import { state, saveSoon, replaceProject, customerFor } from '../../state.js';

export const id = 'documents';
export const name = 'Quotes & invoices';
export const short = 'Docs';

const touch = (rerender) => { saveSoon(); rerender(); };

function allDocuments() {
  const out = [];
  for (const project of state.projects) {
    for (const quote of project.quotes || []) out.push({ project, document: quote });
    for (const invoice of project.invoices || []) out.push({ project, document: invoice });
  }
  return out.sort((a, b) => (b.document.issuedAt || '').localeCompare(a.document.issuedAt || ''));
}

function findActive() {
  return allDocuments().find((row) => row.document.id === state.activeDocumentId) || null;
}

function persist(project, document_) {
  const key = document_.kind === 'invoice' ? 'invoices' : 'quotes';
  const list = project[key].map((d) => (d.id === document_.id ? document_ : d));
  replaceProject({ ...project, [key]: list });
}

/** Remove a quote or invoice from its project — for clearing test/training entries. */
function removeDocument(project, doc) {
  const key = doc.kind === 'invoice' ? 'invoices' : 'quotes';
  replaceProject({ ...project, [key]: (project[key] || []).filter((d) => d.id !== doc.id) });
  if (state.activeDocumentId === doc.id) state.activeDocumentId = null;
}

/* ----------------------------------------------------------------- list -- */

function documentList(ctx) {
  const { rerender } = ctx;
  const rows = allDocuments();

  if (!rows.length) {
    return [emptyState('No quotes or invoices yet. Open a project and create a quote from it.')];
  }

  const now = new Date();
  const owed = rows
    .filter((r) => r.document.kind === 'invoice')
    .reduce((t, r) => t + outstanding(r.document), 0);
  const overdue = rows.filter((r) => r.document.kind === 'invoice' && isOverdue(r.document, now));

  return [
    el('div', { class: 'summary-grid' }, [
      statTile('Documents', String(rows.length)),
      statTile('Outstanding', fmtMoney(owed, state.settings.currencyCode), { tone: owed ? 'warn' : null }),
      statTile('Overdue', String(overdue.length), { tone: overdue.length ? 'danger' : null }),
    ]),
    ...overdue.map((r) => banner('danger',
      `${r.document.number} for ${r.document.customer?.name || 'a customer'} is overdue: `
      + `${fmtMoney(outstanding(r.document), r.document.currencyCode)} outstanding.`)),
    table([
      {
        label: 'Number',
        get: (r) => button(r.document.number, () => {
          state.activeDocumentId = r.document.id;
          touch(rerender);
        }, { key: `open-doc-${r.document.id}` }),
      },
      { label: 'Kind', get: (r) => (r.document.kind === 'invoice' ? 'Invoice' : 'Quote') },
      { label: 'Customer', get: (r) => r.document.customer?.name || '—' },
      { label: 'Project', get: (r) => r.project.name },
      { label: 'Date', get: (r) => new Date(r.document.issuedAt).toLocaleDateString() },
      {
        label: 'Status',
        get: (r) => {
          const status = displayStatus(r.document, now);
          return pill(status.name + (status.computed ? ' *' : ''), status.tone);
        },
      },
      {
        label: 'Total',
        align: 'right',
        mono: true,
        get: (r) => fmtMoney(r.document.total, r.document.currencyCode),
      },
      {
        label: 'Outstanding',
        align: 'right',
        mono: true,
        get: (r) => (r.document.kind === 'invoice'
          ? fmtMoney(outstanding(r.document), r.document.currencyCode) : '—'),
      },
      {
        label: '',
        get: (r) => button('Delete', () => {
          if (!window.confirm(`Delete ${r.document.kind} ${r.document.number} for good?`)) return;
          removeDocument(r.project, r.document);
          toast(`${r.document.kind === 'invoice' ? 'Invoice' : 'Quote'} deleted`);
          touch(rerender);
        }, { key: `del-doc-${r.document.id}`, danger: true }),
      },
    ], rows),
    muted('A status marked * is worked out from the date rather than stored, so it is '
      + 'never stale.'),
  ];
}

/* ------------------------------------------------------------- document -- */

function documentView(ctx, { project, document: doc }) {
  const { rerender } = ctx;
  const code = doc.currencyCode;
  const status = displayStatus(doc);
  const drift = assumptionDrift(doc, state.settings);
  const { rows, extras } = documentRows(doc);

  const nodes = [
    el('div', { class: 'panel__head' }, [
      el('div', {}, [
        el('h2', { text: `${doc.kind === 'invoice' ? 'Invoice' : 'Quotation'} ${doc.number}` }),
        el('p', {
          class: 'muted',
          text: `${doc.customer?.name || 'No customer'} · ${project.name} · `
            + `issued ${new Date(doc.issuedAt).toLocaleDateString()}`
            + (doc.revision > 1 ? ` · revision ${doc.revision}` : ''),
        }),
      ]),
      el('div', { class: 'btn-row' }, [
        pill(status.name, status.tone),
        button('Back to the list', () => {
          state.activeDocumentId = null;
          touch(rerender);
        }, { key: 'close-doc' }),
      ]),
    ]),
  ];

  if (drift.length) {
    nodes.push(banner('info',
      `${drift.length} assumption${drift.length === 1 ? ' has' : 's have'} changed since this `
      + 'was priced. This document keeps the numbers it was issued with — create a revision '
      + 'if you want today’s.'));
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'What has changed since' }),
      table([
        { label: 'Assumption', key: 'label' },
        { label: 'Then', align: 'right', mono: true, get: (d) => String(d.was) },
        { label: 'Now', align: 'right', mono: true, get: (d) => String(d.now) },
      ], drift, { compact: true }),
    ]));
  }

  nodes.push(el('div', { class: 'panel' }, [
    table([
      { label: 'Description', get: (r) => el('div', {}, [
        el('strong', { text: r.description }),
        el('div', { class: 'muted', text: r.detail }),
      ]) },
      { label: 'Qty', align: 'right', mono: true, get: (r) => String(r.quantity) },
      { label: 'Unit', align: 'right', mono: true, get: (r) => fmtMoney(r.unitPrice, code) },
      { label: 'Total', align: 'right', mono: true, get: (r) => fmtMoney(r.total, code) },
    ], rows),
    el('div', { class: 'totals' }, [
      costRow('Parts', doc.parts, code),
      ...extras.map((extra) => costRow(extra.label, extra.amount, code, { sub: true })),
      doc.tax ? costRow(`${doc.taxName} ${fmtRate(doc.taxRate)}`, doc.tax, code, { sub: true }) : null,
      costRow('Total', doc.total, code, { strong: true }),
      doc.kind === 'invoice' && doc.paid
        ? costRow('Paid', -doc.paid, code, { sub: true }) : null,
      doc.kind === 'invoice'
        ? costRow('Outstanding', outstanding(doc), code, { strong: true }) : null,
    ]),
  ]));

  if (state.mode !== 'simple') {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'Internal — not on the customer’s copy' }),
      el('div', { class: 'summary-grid' }, [
        statTile('Cost to Company', fmtMoney(doc.internal.costToCompany, code)),
        statTile('Gross profit', fmtMoney(doc.internal.profit, code), { tone: 'ok' }),
        statTile('Margin', fmtRate(doc.internal.margin)),
        statTile('Demand at issue', `${num(doc.internal.demand?.multiplier, 1).toFixed(2)}×`),
      ]),
      muted('These figures are stored with the document but never rendered on the printed '
        + 'sheet or the CSV a customer receives.'),
    ]));
  }

  if (doc.kind === 'invoice' && doc.payments?.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'Payments' }),
      table([
        { label: 'When', get: (p) => new Date(p.at).toLocaleDateString() },
        { label: 'Reference', get: (p) => p.reference || '—' },
        { label: 'Amount', align: 'right', mono: true, get: (p) => fmtMoney(p.amount, code) },
      ], doc.payments, { compact: true }),
    ]));
  }

  return nodes;
}

/* -------------------------------------------------------------- sidebar -- */

export function sidebar(ctx) {
  const { rerender } = ctx;
  const active = findActive();
  if (!active) return [];
  const { project, document: doc } = active;
  const code = doc.currencyCode;
  const statuses = doc.kind === 'invoice' ? INVOICE_STATUSES : QUOTE_STATUSES;

  return [
    section('doc-status', 'Status', [
      selectField('doc-status-pick', 'Status',
        statuses.map((s) => ({ value: s.id, label: s.name })),
        doc.status, (v) => { persist(project, { ...doc, status: v }); touch(rerender); }),
      doc.kind === 'quote'
        ? muted(`Valid until ${doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : '—'}.`)
        : muted(`Due ${doc.dueAt ? new Date(doc.dueAt).toLocaleDateString() : '—'}.`),
    ]),

    doc.kind === 'invoice' ? section('doc-payment', 'Record a payment', [
      numberField('payment-amount', 'Amount', state.ui.paymentAmount ?? outstanding(doc),
        (v) => { state.ui.paymentAmount = num(v); saveSoon(); }, { min: 0, step: 0.01, suffix: code }),
      textField('payment-ref', 'Reference', state.ui.paymentRef || '',
        (v) => { state.ui.paymentRef = v; saveSoon(); }),
      buttonRow([button('Record it', () => {
        const amount = num(state.ui.paymentAmount ?? outstanding(doc));
        if (amount <= 0) { toast('Enter an amount'); return; }
        persist(project, recordPayment(doc, amount, { reference: state.ui.paymentRef || '' }));
        state.ui.paymentAmount = null;
        state.ui.paymentRef = '';
        toast('Payment recorded');
        touch(rerender);
      }, { primary: true, key: 'record-payment' })]),
    ]) : null,

    section('doc-export', 'Send and export', [
      buttonRow([
        button('Print or save as PDF', () => {
          const host = document.getElementById('print-host');
          buildPrintSheet(doc, { host });
          document.body.classList.add('printing');
          printSheet();
          setTimeout(() => document.body.classList.remove('printing'), 500);
        }, { primary: true, key: 'print-doc' }),
        button('CSV', () => downloadCsv(documentCsv(doc), csvFilename(doc)), { key: 'doc-csv' }),
      ]),
      muted('The printed sheet carries only what the customer should see. Your cost, '
        + 'profit and allocation stay in the app.'),
    ]),

    section('doc-revision', 'Reprice', [
      muted('Repricing makes a new revision with today’s costs and settings. The document '
        + 'you are looking at is never rewritten.'),
      buttonRow([button('Create a revision at today’s prices', () => {
        const order = orderFromProject(project, { customer: customerFor(project) });
        const result = calculateOrder(order, state.settings);
        const next = reprice(doc, { result, order, settings: state.settings });
        const key = doc.kind === 'invoice' ? 'invoices' : 'quotes';
        replaceProject({ ...project, [key]: [...project[key], next] });
        state.activeDocumentId = next.id;
        toast(`Revision ${next.revision} created`);
        touch(rerender);
      }, { key: 'reprice' })]),
    ], { open: false }),
  ].filter(Boolean);
}

export function main(ctx) {
  const active = findActive();
  return active ? documentView(ctx, active) : documentList(ctx);
}
