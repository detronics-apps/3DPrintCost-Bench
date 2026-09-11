/**
 * The customer's request, turned into something the company can import. Pure.
 *
 * The portal has no server, so a request cannot post itself. Instead it is
 * packaged as the SAME shape the app already imports - a project with a
 * customer attached - and the customer sends that file over. Opening it in the
 * workshop creates the project and the customer in one step, with everything
 * they chose already filled in: nothing is re-typed, and their contact and
 * delivery details become a real customer record.
 *
 * A request can carry several parts, exactly as the internal estimator does -
 * one project, many parts, sharing the order's delivery.
 *
 * It carries the customer's own quoted figure for reference only. The workshop
 * re-prices from the sliced part; the quote is what the customer was shown, not
 * a number to be trusted as final.
 */

import {
  makeProject, makePart, makeCustomer, makeAddressParts, formatAddress,
  defaultWorkflow, logEvent,
} from './projects.js';
import { num } from './money.js';

function partFrom(selection, printerId, slots) {
  return makePart({
    name: selection?.modelName || 'Part',
    quantity: Math.max(1, Math.round(num(selection?.quantity, 1))),
    profileId: selection?.profileId,
    printerId: selection?.printerId || printerId,
    materialId: selection?.materialId,
    geometry: selection?.geometry || null,
    orientedSize: selection?.orientedSize || null,
    // The whole-part post-processing the customer chose, as an operation map;
    // per-component choices (fit) ride on the hardware entries below.
    postProcessing: (selection?.postProcessing && typeof selection.postProcessing === 'object')
      ? { ...selection.postProcessing } : {},
    nfcUrl: (selection?.nfcUrl || '').trim(),
    mustFit: !!selection?.mustFit,
    // The components the customer asked for, each keeping its own per-op choices
    // (fit an after-print component rather than ship it loose in the box).
    hardware: Array.isArray(selection?.hardware)
      ? selection.hardware.map((h) => ({
        hardwareId: h.hardwareId,
        qty: Math.max(1, Math.round(num(h.qty, 1))),
        ...(h.ops && typeof h.ops === 'object' ? { ops: { ...h.ops } } : {}),
        ...(h.fit === true ? { ops: { fit: true } } : {}),
      }))
      : [],
    // The bed's loaded filament and this part's share of it, so the workshop
    // opens the request with every head already filled in — no re-picking the
    // colours the customer chose. A single-spool request leaves these null and
    // behaves exactly as a one-colour part.
    slots: Array.isArray(selection?.slots) && selection.slots.length
      ? selection.slots.map((s) => ({ ...s }))
      : (Array.isArray(slots) && slots.length ? slots.map((s) => ({ ...s })) : null),
    mix: Array.isArray(selection?.mix) && selection.mix.length ? selection.mix.map((m) => ({ ...m })) : null,
    colours: Math.max(1, Math.round(num(selection?.colours, 1))),
  });
}

/**
 * Build the importable payload from what the customer chose.
 *
 * `parts` is the list of parts they configured (each its own model, material,
 * quantity); `printerId` is the bed printer they all share; `customer` is who
 * they are and where it goes; `order` is the delivery choice; `quotedTotal` is
 * the padded price they were shown, kept only as a note on the project.
 */
export function portalRequest({
  company, parts, printerId = null, slots = null, customer, order, quotedTotal, currencyCode,
  validityDays = null, expedited = false, now = Date.now(),
}) {
  const exportedAt = new Date(now).toISOString();
  const validUntil = validityDays != null
    ? new Date(now + Math.max(1, Math.round(num(validityDays))) * 86400000).toISOString()
    : null;
  // The address may arrive structured (from the portal's fields) or as a plain
  // string (a legacy caller). Either way the customer record keeps BOTH: the
  // one-string `address` documents print, and the structured `addressParts`.
  const addrParts = customer?.addressParts ? makeAddressParts(customer.addressParts) : null;
  const composed = addrParts ? formatAddress(addrParts) : (customer?.address || '').trim();

  const composedName = `${(customer?.firstName || '').trim()} ${(customer?.surname || '').trim()}`.trim();
  const cust = makeCustomer({
    name: composedName || (customer?.name || '').trim() || 'Customer from a request',
    firstName: (customer?.firstName || '').trim(),
    surname: (customer?.surname || '').trim(),
    email: (customer?.email || '').trim(),
    phone: (customer?.phone || '').trim(),
    countryId: customer?.countryId || null,
    // Consent from the form's opt-in — only ever true when the client ticked it.
    newsletter: !!customer?.newsletter,
    // A business's VAT number, for its invoice.
    vatNumber: (customer?.vatNumber || '').trim(),
    address: composed,
    ...(addrParts ? { addressParts: addrParts } : {}),
    notes: (customer?.notes || '').trim(),
  });

  const projectParts = (parts || []).map((p) => partFrom(p, printerId, slots));
  if (!projectParts.length) projectParts.push(makePart());

  const money = quotedTotal != null
    ? `${currencyCode || ''} ${num(quotedTotal).toFixed(2)}`.trim()
    : null;

  const title = projectParts.length === 1
    ? `${cust.name} — ${projectParts[0].name}`
    : `${cust.name} — ${projectParts.length} parts`;

  // An expedited request skips the quote: the client accepted and paid the
  // estimate, so it lands in Awaiting payment (proof of payment to verify) with
  // the paid figure carried on the workflow, rather than starting in Quotation.
  const isExpedited = !!expedited;

  let project = makeProject({
    name: title,
    customerId: cust.id,
    customerName: cust.name,
    status: 'draft',
    // The bed printer is a PROJECT-level fact (one bed for the whole job), so the
    // machine the customer's colours resolved to has to land here — not only on
    // each part — or the import opens on the app's default printer instead.
    ...(printerId ? { printerId } : {}),
    ...(Array.isArray(slots) && slots.length ? { slots: slots.map((s) => ({ ...s })) } : {}),
    ...(isExpedited ? {
      phase: 'awaiting-payment',
      workflow: {
        ...defaultWorkflow(),
        expedited: true,
        expeditedTotal: quotedTotal != null ? num(quotedTotal) : null,
      },
    } : {}),
    parts: projectParts,
    order: {
      shippingMethodId: order?.shippingMethodId || 'auto',
      packagingContainerId: null,
      packagingConsumables: null,
      // The client chose to collect it themselves — no courier is booked.
      packagingCollected: !!order?.packagingCollected || order?.shippingMethodId === 'collect',
      insured: false,
      extras: [],
    },
    notes: [
      isExpedited ? 'Imported from a customer request — EXPEDITED (client paid the estimate).' : 'Imported from a customer request.',
      isExpedited && money ? `They paid the estimate of about ${money}. Verify proof of payment, then confirm to raise the invoice and start production.` : null,
      !isExpedited && money ? `They were quoted about ${money} (indicative — re-price from the sliced parts).` : null,
      validUntil ? `Their quote was valid until ${new Date(validUntil).toLocaleDateString()}.` : null,
      projectParts.some((p) => p.mustFit)
        ? 'FIT-CRITICAL: a part must fit/mate with another — a dimensioned drawing should be attached; hold the critical dimensions.'
        : null,
      cust.notes ? `Customer note: ${cust.notes}` : null,
    ].filter(Boolean).join('\n'),
  });

  if (isExpedited) {
    project = logEvent(project, 'imported-expedited',
      `Imported as an expedited order — client paid the estimate${money ? ` (${money})` : ''}`);
  } else {
    project = logEvent(project, 'imported', 'Imported from a customer request');
  }

  // `kind: 'project'` with a sibling `customer` is exactly what importFile reads,
  // so no new import path is needed - the workshop's Open button handles it.
  return {
    kind: 'project',
    v: 1,
    source: 'customer-portal',
    from: company?.name || '',
    expedited: isExpedited,
    quotedTotal: quotedTotal != null ? num(quotedTotal) : null,
    currencyCode: currencyCode || null,
    exportedAt,
    validUntil,
    project,
    customer: cust,
  };
}
