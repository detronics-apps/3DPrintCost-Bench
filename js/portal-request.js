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

import { makeProject, makePart, makeCustomer, makeAddressParts, formatAddress } from './projects.js';
import { num } from './money.js';

function partFrom(selection, printerId) {
  return makePart({
    name: selection?.modelName || 'Part',
    quantity: Math.max(1, Math.round(num(selection?.quantity, 1))),
    profileId: selection?.profileId,
    printerId: selection?.printerId || printerId,
    materialId: selection?.materialId,
    geometry: selection?.geometry || null,
    orientedSize: selection?.orientedSize || null,
    needsSupport: !!selection?.needsSupport,
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
  company, parts, printerId = null, customer, order, quotedTotal, currencyCode,
  validityDays = null, now = Date.now(),
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

  const cust = makeCustomer({
    name: (customer?.name || '').trim() || 'Customer from a request',
    email: (customer?.email || '').trim(),
    phone: (customer?.phone || '').trim(),
    address: composed,
    ...(addrParts ? { addressParts: addrParts } : {}),
    notes: (customer?.notes || '').trim(),
  });

  const projectParts = (parts || []).map((p) => partFrom(p, printerId));
  if (!projectParts.length) projectParts.push(makePart());

  const money = quotedTotal != null
    ? `${currencyCode || ''} ${num(quotedTotal).toFixed(2)}`.trim()
    : null;

  const title = projectParts.length === 1
    ? `${cust.name} — ${projectParts[0].name}`
    : `${cust.name} — ${projectParts.length} parts`;

  const project = makeProject({
    name: title,
    customerId: cust.id,
    customerName: cust.name,
    status: 'draft',
    parts: projectParts,
    order: {
      shippingMethodId: order?.shippingMethodId || 'auto',
      packagingContainerId: null,
      packagingConsumables: null,
      packagingCollected: false,
      insured: false,
      extras: [],
    },
    notes: [
      'Imported from a customer request.',
      money ? `They were quoted about ${money} (indicative — re-price from the sliced parts).` : null,
      validUntil ? `Their quote was valid until ${new Date(validUntil).toLocaleDateString()}.` : null,
      cust.notes ? `Customer note: ${cust.notes}` : null,
    ].filter(Boolean).join('\n'),
  });

  // `kind: 'project'` with a sibling `customer` is exactly what importFile reads,
  // so no new import path is needed - the workshop's Open button handles it.
  return {
    kind: 'project',
    v: 1,
    source: 'customer-portal',
    from: company?.name || '',
    quotedTotal: quotedTotal != null ? num(quotedTotal) : null,
    currencyCode: currencyCode || null,
    exportedAt,
    validUntil,
    project,
    customer: cust,
  };
}
