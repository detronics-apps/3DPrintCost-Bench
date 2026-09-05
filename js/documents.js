/**
 * Quotes and invoices. Pure.
 *
 * A document is a SNAPSHOT, not a view. It stores the priced result and the
 * assumptions it was priced under, so re-opening a quote from three months ago
 * shows what the customer was actually told - not what today's material prices
 * and demand multiplier would have said.
 *
 * `reprice()` exists for the case where somebody genuinely wants today's
 * numbers, and it makes a NEW revision rather than editing the old one.
 */

import { num, round, fmtMoney } from './money.js';
import { makeId, nowIso } from './projects.js';
import { resolveLabourRate } from './labour.js';
import { findCountry } from './countries.js';

export const QUOTE_STATUSES = [
  { id: 'draft', name: 'Draft', tone: 'info' },
  { id: 'sent', name: 'Sent', tone: 'info' },
  { id: 'accepted', name: 'Accepted', tone: 'ok' },
  { id: 'declined', name: 'Declined', tone: 'danger' },
  { id: 'expired', name: 'Expired', tone: 'warn' },
];

export const INVOICE_STATUSES = [
  { id: 'draft', name: 'Draft', tone: 'info' },
  { id: 'sent', name: 'Sent', tone: 'info' },
  { id: 'paid', name: 'Paid', tone: 'ok' },
  { id: 'partial', name: 'Partially paid', tone: 'warn' },
  { id: 'overdue', name: 'Overdue', tone: 'danger' },
  { id: 'cancelled', name: 'Cancelled', tone: 'danger' },
];

export function quoteStatus(id) {
  return QUOTE_STATUSES.find((s) => s.id === id) || QUOTE_STATUSES[0];
}

export function invoiceStatus(id) {
  return INVOICE_STATUSES.find((s) => s.id === id) || INVOICE_STATUSES[0];
}

/**
 * The assumptions a document has to remember.
 *
 * Not the whole settings object: a quote does not need the UI's section states
 * or the customer portal's configuration, and storing them makes every export
 * larger and every diff unreadable. It DOES need everything that moved a
 * number, which is what this list is.
 */
export function snapshotAssumptions(settings) {
  return {
    at: nowIso(),
    countryId: settings.countryId,
    currencyCode: settings.currencyCode,
    electricityAlternativeId: settings.electricityAlternativeId,
    tax: { ...settings.tax },
    // The rate the job was actually priced at, however it was set - a direct
    // rate or one worked out from a salary - so a re-opened document shows what
    // was charged, not today's inputs.
    labourRate: resolveLabourRate(settings.labour, findCountry(settings.countries, settings.countryId)?.labourRate),
    ctc: { ...settings.ctc },
    scrap: { ...settings.scrap },
    thirds: { ...settings.thirds },
    demand: { ...settings.demand },
    freeShipping: { ...settings.freeShipping },
    handling: { ...settings.handling },
    storage: { ...settings.storage },
    presetId: settings.presetId,
    allocations: (settings.allocations || []).map((a) => ({ ...a })),
    volumeTiers: (settings.volumeTiers || []).map((t) => ({ ...t })),
    /** Profile versions, so a later profile edit is visible as a difference. */
    profiles: (settings.profiles || []).map((p) => ({
      id: p.id, name: p.name, version: p.version, settings: { ...p.settings },
    })),
    materialPrices: (settings.materials || []).map((m) => ({
      id: m.id, price: m.prices?.[settings.countryId] ?? null, override: m.priceOverride ?? null,
    })),
    printers: (settings.printers || []).map((p) => ({
      id: p.id, purchasePrice: p.purchasePrice, hoursPerYear: p.hoursPerYear,
      serviceLifeYears: p.serviceLifeYears, powerW: p.powerW,
    })),
  };
}

/**
 * Only what the customer sees, taken from the priced result.
 *
 * Internal cost, profit and allocation are deliberately NOT here. A quote that
 * carries the company's margin in a field nobody renders is one careless export
 * away from being a problem.
 */
function customerLines(result, order) {
  return result.lines.map((line, i) => {
    const source = (order.lines || [])[i] || {};
    return {
      name: source.name || `Part ${i + 1}`,
      partNumber: source.partNumber || '',
      description: [
        line.profile.name,
        line.material.name,
        line.material.colour,
      ].filter(Boolean).join(' · '),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitPriceBeforeDiscount: line.price.price,
      discount: line.lineDiscount,
      total: line.lineTotal,
    };
  });
}

/**
 * Build a quote from a priced order.
 *
 * `internal` is stored separately from `document` so the customer-facing export
 * can drop one field and be certain nothing internal went with it.
 */
export function makeQuote({ number, project, customer, result, order, settings, validityDays }) {
  const days = Math.max(1, Math.round(num(validityDays, settings.company?.quoteValidityDays ?? 30)));
  const issued = new Date();
  const expires = new Date(issued.getTime() + days * 86400000);

  return {
    id: makeId('quote'),
    kind: 'quote',
    number,
    revision: 1,
    status: 'draft',
    issuedAt: issued.toISOString(),
    expiresAt: expires.toISOString(),
    validityDays: days,

    company: { ...settings.company },
    customer: customer ? {
      id: customer.id, name: customer.name, email: customer.email,
      address: customer.address, vatNumber: customer.vatNumber,
    } : { name: project?.customerName || '', email: '', address: '', vatNumber: '' },
    projectId: project?.id || null,
    projectName: project?.name || '',

    currencyCode: result.currencyCode,
    lines: customerLines(result, order),
    subtotal: result.parts.beforeDiscount,
    discount: result.parts.discount,
    parts: result.parts.total,
    packaging: result.orderExtras.packaging,
    shipping: result.orderExtras.shipping,
    handling: result.orderExtras.handling,
    storage: result.orderExtras.storage,
    extras: result.orderExtras.extras,
    net: result.totals.net,
    taxRate: result.tax.rate,
    taxName: settings.tax?.name || 'Tax',
    taxInclusive: result.tax.inclusive,
    tax: result.tax.tax,
    total: result.totals.finalInvoice,

    shippingMethod: result.shipping.method?.name || 'Not selected',
    freeShipping: result.shipping.free,
    leadTimeDays: result.capacity.leadDays,
    terms: settings.company?.terms || '',

    /** Never rendered to a customer. */
    internal: {
      costToCompany: result.totals.costToCompany,
      profit: result.totals.partPrice - result.totals.costToCompany,
      margin: result.totals.partPrice > 0
        ? (result.totals.partPrice - result.totals.costToCompany) / result.totals.partPrice
        : 0,
      demand: result.demand,
      allocation: result.allocation,
    },
    assumptions: snapshotAssumptions(settings),
  };
}

/**
 * The price a project is LOCKED to, once it has been invoiced.
 *
 * An invoice froze its numbers the moment it was raised - the customer total,
 * and the internal cost and profit behind it. So a project that has been
 * invoiced has a settled price that later changes to the labour rate or the
 * material costs must not move. This reads that settled price straight off the
 * most recent invoice; a project with no invoice returns null and is still
 * priced live, because nothing has been agreed yet.
 */
export function lockedPricing(invoices) {
  const list = (invoices || []).filter(Boolean);
  if (!list.length) return null;
  const inv = list[list.length - 1];
  const costToCompany = num(inv.internal?.costToCompany);
  return {
    number: inv.number,
    at: inv.issuedAt,
    currencyCode: inv.currencyCode,
    finalInvoice: num(inv.total),
    costToCompany,
    partPrice: costToCompany + num(inv.internal?.profit),
  };
}

/**
 * Force a document's total to an agreed figure and keep the breakdown summing.
 *
 * An expedited order is one the client accepted at the estimate they were shown
 * and paid up front. That estimate is the agreed price, which can sit above the
 * internally-priced total (the padding is what makes the estimate safe). Rather
 * than re-derive every line, the difference is reconciled as one adjustment line,
 * so the invoice still adds up and its total is exactly what the client paid. The
 * surplus over the priced total is extra margin, so it is added to the internal
 * profit too.
 */
export function agreeTotal(doc, total) {
  const target = Math.max(0, num(total));
  const delta = round(target - num(doc.total), doc.currencyCode);
  if (Math.abs(delta) < 0.005) return doc;
  return {
    ...doc,
    extras: [...(doc.extras || []), { name: 'Expedite — agreed estimate price', amount: delta }],
    net: num(doc.net) + delta,
    total: target,
    internal: { ...(doc.internal || {}), profit: num(doc.internal?.profit) + delta },
  };
}

/** An invoice made from an accepted quote keeps that quote's numbers. */
export function invoiceFromQuote(quote, { number, dueDays = 14 }) {
  const issued = new Date();
  const due = new Date(issued.getTime() + Math.max(0, dueDays) * 86400000);
  return {
    ...quote,
    id: makeId('inv'),
    kind: 'invoice',
    number,
    status: 'draft',
    quoteNumber: quote.number,
    issuedAt: issued.toISOString(),
    dueAt: due.toISOString(),
    expiresAt: null,
    paid: 0,
    payments: [],
  };
}

export function recordPayment(invoice, amount, { at = nowIso(), reference = '' } = {}) {
  const payment = { at, amount: Math.max(0, num(amount)), reference };
  const payments = [...(invoice.payments || []), payment];
  const paid = payments.reduce((t, p) => t + p.amount, 0);
  const status = paid <= 0 ? invoice.status
    : (paid + 1e-9 >= invoice.total ? 'paid' : 'partial');
  return { ...invoice, payments, paid, status };
}

export const outstanding = (invoice) => Math.max(0, num(invoice.total) - num(invoice.paid));

/**
 * Is this invoice overdue?
 *
 * Computed, never stored: a stored `overdue` flag is wrong from the moment the
 * page is closed, and nothing recomputes it.
 */
export function isOverdue(invoice, now = new Date()) {
  if (!invoice.dueAt) return false;
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
  return new Date(invoice.dueAt).getTime() < now.getTime() && outstanding(invoice) > 0;
}

export function displayStatus(doc, now = new Date()) {
  if (doc.kind === 'invoice') {
    if (isOverdue(doc, now) && doc.status !== 'overdue') {
      return { ...invoiceStatus('overdue'), computed: true };
    }
    return invoiceStatus(doc.status);
  }
  if (doc.expiresAt && doc.status === 'sent'
    && new Date(doc.expiresAt).getTime() < now.getTime()) {
    return { ...quoteStatus('expired'), computed: true };
  }
  return quoteStatus(doc.status);
}

/**
 * A new revision priced with today's settings.
 *
 * The original is returned untouched alongside, so the caller stores both and
 * the history is real rather than implied.
 */
export function reprice(doc, { result, order, settings }) {
  const fresh = makeQuote({
    number: doc.number,
    project: { id: doc.projectId, name: doc.projectName },
    customer: doc.customer,
    result,
    order,
    settings,
  });
  return {
    ...fresh,
    id: makeId(doc.kind === 'invoice' ? 'inv' : 'quote'),
    kind: doc.kind,
    revision: num(doc.revision, 1) + 1,
    supersedes: doc.id,
    status: 'draft',
  };
}

/** What changed between what a document assumed and what is true now. */
export function assumptionDrift(doc, settings) {
  const then = doc.assumptions;
  if (!then) return [];
  const drift = [];
  const compare = (label, was, now) => {
    if (was === null || was === undefined) return;
    if (Math.abs(num(was) - num(now)) > 1e-9) {
      drift.push({ label, was: num(was), now: num(now) });
    }
  };

  compare('CTC allowance', then.ctc?.generalAllowance, settings.ctc?.generalAllowance);
  compare('Scrap allowance', then.scrap?.rate, settings.scrap?.rate);
  compare('Commercial share', then.thirds?.commercialShare, settings.thirds?.commercialShare);
  compare('Profit share', then.thirds?.profitShare, settings.thirds?.profitShare);
  compare('Tax rate', then.tax?.rate, settings.tax?.rate);
  compare('Free shipping threshold', then.freeShipping?.threshold, settings.freeShipping?.threshold);

  for (const stored of then.materialPrices || []) {
    const live = settings.materials.find((m) => m.id === stored.id);
    if (!live) continue;
    const now = live.priceOverride ?? live.prices?.[settings.countryId];
    const was = stored.override ?? stored.price;
    if (was != null && now != null && Math.abs(num(was) - num(now)) > 1e-9) {
      drift.push({ label: `${live.name} price`, was: num(was), now: num(now) });
    }
  }

  for (const stored of then.profiles || []) {
    const live = settings.profiles.find((p) => p.id === stored.id);
    if (live && num(live.version) !== num(stored.version)) {
      drift.push({ label: `${live.name} profile`, was: `v${stored.version}`, now: `v${live.version}` });
    }
  }

  return drift;
}

/** The document as plain rows, for the printed sheet and the CSV. */
export function documentRows(doc) {
  const rows = doc.lines.map((line) => ({
    description: `${line.name}${line.partNumber ? ` (${line.partNumber})` : ''}`,
    detail: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.total,
  }));

  const extras = [];
  const push = (label, amount) => {
    if (Math.abs(num(amount)) > 0.004) extras.push({ label, amount: num(amount) });
  };
  push('Discount', -num(doc.discount));
  push('Packaging', doc.packaging);
  push(doc.freeShipping ? 'Shipping (free)' : 'Shipping', doc.shipping);
  push('Handling', doc.handling);
  push('Storage', doc.storage);
  for (const extra of doc.extras || []) push(extra.name, extra.amount);

  return { rows, extras };
}

export function documentFilename(doc) {
  const who = (doc.customer?.name || 'customer').replace(/[^\w-]+/g, '-').toLowerCase();
  return `${doc.number || doc.kind}-${who}`.replace(/-+/g, '-');
}

/** A one-line summary for a list. */
export function documentSummary(doc) {
  return `${doc.number} · ${doc.customer?.name || 'No customer'} · `
    + `${fmtMoney(round(doc.total, doc.currencyCode), doc.currencyCode)}`;
}
