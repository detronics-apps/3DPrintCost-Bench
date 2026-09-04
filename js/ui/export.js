/**
 * Export: SVG, PNG, CSV, a share link and a printable sheet.
 *
 * Everything here is local. A download is a blob URL the browser makes and
 * revokes; a share link is a URL fragment, which browsers never transmit to a
 * server. Nothing in this file opens a network connection.
 */

import { download, toast } from './dom.js';
import { standaloneSvg } from './patterns.js';
import { fmtMoney, round } from '../money.js';
import { documentRows, documentFilename } from '../documents.js';
import { groupLabour } from '../labour.js';
import { findMaterial } from '../materials.js';

/**
 * Serialise a live SVG into a standalone file.
 *
 * `var(--token)` resolves against the document; in a downloaded file there is
 * no document and no tokens, so the clone is walked and every token replaced
 * with its computed value before serialising (pitfalls #7). The check below is
 * not a belt-and-braces flourish - it is the assertion that catches it.
 */
export function serialiseSvg(node) {
  const { node: clone, width, height } = standaloneSvg(node);
  const markup = new XMLSerializer().serializeToString(clone);
  if (markup.includes('var(--')) {
    throw new Error('Export still contains unresolved CSS custom properties');
  }
  return { markup, width, height };
}

export function downloadSvg(node, filename) {
  const { markup } = serialiseSvg(node);
  download(new Blob([markup], { type: 'image/svg+xml' }), `${filename}.svg`);
  toast('SVG saved');
}

export function downloadPng(node, filename, { scale = 2 } = {}) {
  const { markup, width, height } = serialiseSvg(node);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));

  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${filename}.png`);
      toast('PNG saved');
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    toast('Could not render the PNG');
  };
  image.src = url;
}

/* ------------------------------------------------------------------ CSV -- */

/**
 * A CSV cell.
 *
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet treat the cell as a
 * formula. Prefixing an apostrophe is the standard way to stop that, and it
 * matters here because part names come from customers.
 */
function cell(value) {
  const raw = value == null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export const toCsv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

export function downloadCsv(rows, filename) {
  // The BOM is what makes Excel read UTF-8 rather than the local codepage,
  // which otherwise turns every R and × into mojibake.
  download(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  toast('CSV saved');
}

/** A priced order as spreadsheet rows: the customer view, then the internal one. */
export function orderCsv(result, { includeInternal = true } = {}) {
  const code = result.currencyCode;
  const money = (v) => round(v, code);

  const rows = [
    ['Part', 'Profile', 'Printer', 'Material', 'Quantity', 'Grams each', 'Minutes each',
      'CTC each', 'Unit price', 'Line total'],
  ];
  for (const line of result.lines) {
    rows.push([
      line.name || 'Part',
      line.profile.name,
      line.printer.name,
      `${line.material.name} ${line.material.colour}`,
      line.quantity,
      money(line.estimate.grams),
      Math.round(line.estimate.minutes),
      money(line.ctc),
      money(line.unitPrice),
      money(line.lineTotal),
    ]);
  }

  rows.push([]);
  rows.push(['Parts before discount', money(result.parts.beforeDiscount)]);
  rows.push(['Discount', money(-result.parts.discount)]);
  rows.push(['Parts', money(result.parts.total)]);
  rows.push(['Packaging', money(result.orderExtras.packaging)]);
  rows.push([result.shipping.free ? 'Shipping (free)' : 'Shipping', money(result.orderExtras.shipping)]);
  if (result.orderExtras.handling) rows.push(['Handling', money(result.orderExtras.handling)]);
  if (result.orderExtras.storage) rows.push(['Storage', money(result.orderExtras.storage)]);
  for (const extra of result.orderExtras.extras) rows.push([extra.name, money(extra.amount)]);
  rows.push(['Net', money(result.totals.net)]);
  if (result.tax.tax) rows.push(['Tax', money(result.tax.tax)]);
  rows.push(['Invoice total', money(result.totals.finalInvoice)]);

  if (includeInternal) {
    rows.push([]);
    rows.push(['--- Internal, not for the customer ---']);
    rows.push(['Cost to Company', money(result.totals.costToCompany)]);
    rows.push(['Gross profit on parts', money(result.parts.total - result.totals.costToCompany)]);
    rows.push(['Demand multiplier', result.demand.multiplier]);
    for (const line of result.allocation.lines) {
      rows.push([`Allocation: ${line.name}`, money(line.amount),
        line.overlapsDirect ? 'Already charged directly' : '']);
    }
  }
  return rows;
}

/* --------------------------------------------------------- printed sheet -- */

/**
 * The printable quote or invoice.
 *
 * Built as real DOM inside the page and shown by a print stylesheet rather than
 * opened in a new window: a popup is blocked as often as not, and a document
 * built from a string cannot be checked by anything.
 */
export function buildPrintSheet(doc, { host }) {
  const code = doc.currencyCode;
  const money = (v) => fmtMoney(v, code);
  const { rows, extras } = documentRows(doc);
  const isInvoice = doc.kind === 'invoice';

  host.innerHTML = '';
  const make = (tag, className, textContent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  };

  const sheet = make('article', 'sheet');
  // The company's accent colour tints the headings and the totals rule. It is a
  // CSS variable so the print stylesheet can use it without knowing the value.
  if (doc.company?.accentColour) sheet.style.setProperty('--sheet-accent', doc.company.accentColour);

  const head = make('header', 'sheet__head');
  const company = make('div', 'sheet__company');
  if (doc.company?.logo) {
    const logo = make('img', 'sheet__logo');
    logo.src = doc.company.logo;
    logo.alt = '';
    company.appendChild(logo);
  }
  company.appendChild(make('h1', null, doc.company?.name || 'Workshop'));
  for (const line of [doc.company?.address, doc.company?.email, doc.company?.phone,
    doc.company?.vatNumber ? `VAT ${doc.company.vatNumber}` : null].filter(Boolean)) {
    company.appendChild(make('p', null, line));
  }
  head.appendChild(company);

  const meta = make('div', 'sheet__meta');
  meta.appendChild(make('h2', null, isInvoice ? 'Invoice' : 'Quotation'));
  const metaRows = [
    ['Number', doc.number],
    ['Date', new Date(doc.issuedAt).toLocaleDateString()],
    isInvoice ? ['Due', doc.dueAt ? new Date(doc.dueAt).toLocaleDateString() : '—']
      : ['Valid until', doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : '—'],
    ['Lead time', `${doc.leadTimeDays} working days`],
  ];
  for (const [label, value] of metaRows) {
    const row = make('div', 'sheet__metarow');
    row.appendChild(make('span', null, label));
    row.appendChild(make('strong', null, String(value)));
    meta.appendChild(row);
  }
  head.appendChild(meta);
  sheet.appendChild(head);

  const to = make('div', 'sheet__to');
  to.appendChild(make('h3', null, isInvoice ? 'Invoice to' : 'Quotation for'));
  to.appendChild(make('p', null, doc.customer?.name || '—'));
  for (const line of [doc.customer?.address, doc.customer?.email].filter(Boolean)) {
    to.appendChild(make('p', null, line));
  }
  sheet.appendChild(to);

  const table = make('table', 'sheet__table');
  const thead = make('thead');
  const headRow = make('tr');
  for (const label of ['Description', 'Qty', 'Unit', 'Total']) {
    const th = make('th', label === 'Description' ? null : 'is-right', label);
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = make('tbody');
  for (const row of rows) {
    const tr = make('tr');
    const description = make('td');
    description.appendChild(make('strong', null, row.description));
    description.appendChild(make('div', 'sheet__detail', row.detail));
    tr.appendChild(description);
    tr.appendChild(make('td', 'is-right', String(row.quantity)));
    tr.appendChild(make('td', 'is-right', money(row.unitPrice)));
    tr.appendChild(make('td', 'is-right', money(row.total)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  sheet.appendChild(table);

  const totals = make('div', 'sheet__totals');
  const addTotal = (label, value, strong = false) => {
    const row = make('div', strong ? 'sheet__total sheet__total--strong' : 'sheet__total');
    row.appendChild(make('span', null, label));
    row.appendChild(make('span', null, money(value)));
    totals.appendChild(row);
  };
  addTotal('Parts', doc.parts);
  for (const extra of extras) addTotal(extra.label, extra.amount);
  if (doc.tax) addTotal(`${doc.taxName} at ${(doc.taxRate * 100).toFixed(0)}%`, doc.tax);
  addTotal('Total', doc.total, true);
  if (isInvoice && doc.paid) {
    addTotal('Paid', -doc.paid);
    addTotal('Outstanding', doc.total - doc.paid, true);
  }
  sheet.appendChild(totals);

  if (doc.terms) {
    const terms = make('div', 'sheet__terms');
    terms.appendChild(make('h3', null, 'Terms'));
    terms.appendChild(make('p', null, doc.terms));
    sheet.appendChild(terms);
  }

  host.appendChild(sheet);
  return sheet;
}

export function printSheet() {
  window.print();
}

/**
 * A sheet of stick-on spool labels, built into the print host the same way the
 * work sheet is. Each label carries what the bench needs to grab the right spool
 * and stay honest about it: the material and colour, the batch, where it lives,
 * and the spool's own id - the link back to the app, so a spool on the shelf and
 * a spool in the stock list are provably the same one.
 */
export function buildSpoolLabels(spools, { host, settings }) {
  host.innerHTML = '';
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const sheet = make('article', 'sheet sheet--labels');
  const grid = make('div', 'labels');

  for (const spool of spools) {
    const material = findMaterial(settings.materials, spool.materialId);
    const label = make('div', 'label');
    label.appendChild(make('div', 'label__title', `${material?.name || 'Filament'} · ${material?.colour || ''}`));

    for (const [key, value] of [
      ['Batch', spool.batch || '—'],
      ['Location', spool.location || '—'],
      ['Spool ID', spool.id],
    ]) {
      const row = make('div', 'label__row');
      row.appendChild(make('span', 'label__key', key));
      row.appendChild(make('strong', 'label__val', value));
      label.appendChild(row);
    }

    label.appendChild(make('div', 'label__foot', settings.company?.name || '3DPrintCost Bench'));
    grid.appendChild(label);
  }

  sheet.appendChild(grid);
  host.appendChild(sheet);
  return sheet;
}

const SHEET_WHEN = {
  order: 'once for the order',
  job: 'once per plate',
  extraJob: 'per extra plate',
  unit: 'per part',
  supportUnit: 'per supported part',
  colourChange: 'per hand change',
  hardwareInsert: 'per insert',
};

/**
 * The labour work sheet: two documents in one.
 *
 * For the bench, it is the ordered list of everything a person does to make the
 * part, with a box to tick off each step - the pick sheet the operator follows.
 * For the customer, it is the itemised answer to "why is the labour R310 when
 * the plastic is R15": every minute is named, so the figure can be read down
 * the column rather than taken on trust.
 *
 * Built as real DOM into the print host and shown by the print stylesheet, the
 * same way the quote and invoice sheets are - a popup is blocked as often as
 * not, and a document assembled from a string cannot be checked by anything.
 */
export function buildLabourSheet(line, { host, currencyCode, company }) {
  const money = (v) => fmtMoney(v, currencyCode);
  const d = line.detail.labour;
  const groups = groupLabour(d.lines);
  const quantity = line.quantity;

  host.innerHTML = '';
  const make = (tag, className, textContent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  };

  const sheet = make('article', 'sheet');

  const head = make('header', 'sheet__head');
  const left = make('div', 'sheet__company');
  left.appendChild(make('h1', null, company?.name || 'Workshop'));
  left.appendChild(make('p', null, `Work sheet — ${line.name}`));
  head.appendChild(left);

  const meta = make('div', 'sheet__meta');
  meta.appendChild(make('h2', null, 'Labour'));
  const metaRows = [
    ['Part', line.name],
    ['Quantity', String(quantity)],
    ['Total labour', `${Math.round(d.minutes)} min`],
    ['Per part', `${Math.round(d.minutesPerUnit)} min`],
    ['Rate', `${money(d.rate)}/h`],
  ];
  for (const [label, value] of metaRows) {
    const row = make('div', 'sheet__metarow');
    row.appendChild(make('span', null, label));
    row.appendChild(make('strong', null, value));
    meta.appendChild(row);
  }
  head.appendChild(meta);
  sheet.appendChild(head);

  const table = make('table', 'sheet__table sheet__table--labour');
  const thead = make('thead');
  const headRow = make('tr');
  for (const [label, cls] of [['✓', 'is-center'], ['Step', null], ['When', null],
    ['Times', 'is-right'], ['Each', 'is-right'], ['Minutes', 'is-right']]) {
    headRow.appendChild(make('th', cls, label));
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = make('tbody');
  for (const group of groups) {
    const groupRow = make('tr', 'sheet__grouprow');
    const groupCell = make('td', null, group.name);
    groupCell.colSpan = 5;
    groupRow.appendChild(make('td', 'is-center'));
    groupRow.appendChild(groupCell);
    tbody.appendChild(groupRow);

    for (const l of group.lines) {
      const tr = make('tr');
      tr.appendChild(make('td', 'is-center', '☐'));
      tr.appendChild(make('td', null, l.name));
      tr.appendChild(make('td', null, SHEET_WHEN[l.per] || l.per));
      tr.appendChild(make('td', 'is-right', String(l.count)));
      tr.appendChild(make('td', 'is-right', `${l.minutesEach} min`));
      tr.appendChild(make('td', 'is-right', `${l.minutes.toFixed(1)}`));
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  sheet.appendChild(table);

  const totals = make('div', 'sheet__totals');
  const addTotal = (label, value, strong = false) => {
    const row = make('div', strong ? 'sheet__total sheet__total--strong' : 'sheet__total');
    row.appendChild(make('span', null, label));
    row.appendChild(make('span', null, value));
    totals.appendChild(row);
  };
  addTotal('Total minutes', `${Math.round(d.minutes)} min`);
  addTotal('Labour cost', money(d.cost), true);
  sheet.appendChild(totals);

  const terms = make('div', 'sheet__terms');
  terms.appendChild(make('h3', null, 'How to read this'));
  terms.appendChild(make('p', null,
    'Order and plate steps happen once however many parts are made, so their cost is '
    + 'shared across the batch — which is why a bigger run costs less labour each. '
    + 'Steps marked "per insert" or "per hand change" pause the print; do them at the '
    + 'layer the slicer stops on.'));
  sheet.appendChild(terms);

  host.appendChild(sheet);
  return sheet;
}

export function documentCsv(doc) {
  const { rows, extras } = documentRows(doc);
  const out = [['Description', 'Detail', 'Quantity', 'Unit price', 'Total']];
  for (const row of rows) {
    out.push([row.description, row.detail, row.quantity,
      round(row.unitPrice, doc.currencyCode), round(row.total, doc.currencyCode)]);
  }
  out.push([]);
  for (const extra of extras) out.push([extra.label, '', '', '', round(extra.amount, doc.currencyCode)]);
  if (doc.tax) out.push([doc.taxName, '', '', '', round(doc.tax, doc.currencyCode)]);
  out.push(['Total', '', '', '', round(doc.total, doc.currencyCode)]);
  return out;
}

export const csvFilename = documentFilename;

export function copyText(value) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => toast('Copied'))
      .catch(() => toast('Could not copy — select the text and copy it by hand'));
    return;
  }
  toast('Copying is not available in this browser');
}

export function downloadJson(text, filename) {
  download(new Blob([text], { type: 'application/json' }), `${filename}.json`);
  toast('Saved');
}
