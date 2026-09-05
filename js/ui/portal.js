/**
 * The customer-facing quoting form.
 *
 * A separate page, deliberately. It uses the SAME calculation engine as
 * internal quoting - there is no second pricing path anywhere in this app - and
 * it now offers the SAME choices as the internal estimator: several parts, each
 * with its own model, print intent and quantity; a printer to run them on; the
 * filament loaded on the bed; and, per part, how much of each colour it is.
 * What it renders none of is the internals - no cost, no margin, no allocation,
 * no demand multiplier, no machine rate, and no material prices. The customer
 * sees a price, a lead time and what they chose.
 *
 * How it is configured, given there is no server. The company opens Settings,
 * turns the form on, and copies a link. That link carries the allowed options
 * and the prices in its URL FRAGMENT, which browsers never transmit anywhere.
 * The customer opens it, drops in models, and gets a price worked out entirely
 * in their own browser. Their models are never uploaded, because there is
 * nothing to upload them to.
 *
 * The honest limitation, stated on the page itself: with no server the request
 * cannot reach the company by itself. The customer downloads it and sends it.
 */

import { el, clear, toast, download } from './dom.js';
import { capDiagramScale, captureFocus, restoreFocus } from './patterns.js';
import {
  numberField, selectField, checkField, chips, button, buttonRow, banner, statTile, table, muted, emptyState,
} from './controls.js';
import { readMesh } from '../mesh.js';
import { platformInflate } from '../zip.js';
import { analyse, fmtSize, mm3ToCm3 } from '../geometry.js';
import { calculateOrder } from '../engine.js';
import { migrateSettings } from '../settings.js';
import { defaultSlots, reconcileSlots, normaliseMix } from '../filaments.js';
import { fmtMoney, num } from '../money.js';
import { portalConfig, settingsFromConfig } from '../portal-config.js';
import { portalRequest } from '../portal-request.js';
import { makeAddressParts, formatAddress, ADDRESS_TYPES } from '../projects.js';
import { filamentSlots, mixEditor } from './filament-slots.js';
import { plateSaving } from '../savings.js';
import { savingsChart } from './svg/savings.js';

export const PORTAL_VERSION = '1.0.0';

const STORE_KEY = '3d-printing-bench';

/* ------------------------------------------------------------------ page -- */

let partSeq = 0;
function makePortalPart(spec = {}) {
  partSeq += 1;
  return {
    id: `pp${partSeq}`,
    modelName: null,
    geometry: null,
    profileId: null,
    mix: null,
    quantity: 1,
    needsSupport: false,
    hardware: [],
    ...spec,
  };
}

const state = {
  config: null,
  settings: null,
  printerId: null,
  materialId: null,
  slots: null,
  shippingMethodId: 'auto',
  expedite: false,
  parts: [makePortalPart()],
  customer: { name: '', email: '', phone: '', notes: '', addressParts: makeAddressParts() },
};

function loadConfig() {
  if (location.hash.length > 1) {
    try {
      const payload = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      if (payload?.pricing) {
        return { ...payload, settings: settingsFromConfig(payload) };
      }
    } catch { /* an unreadable link falls through to the device's own settings */ }
  }
  // On the company's own machine the form works without a link.
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (stored?.settings) {
      const config = portalConfig(migrateSettings(stored.settings));
      return { ...config, settings: settingsFromConfig(config) };
    }
  } catch { /* no stored workshop */ }
  return null;
}

/** Only the materials the company put on the customer's list. */
function allowedMaterials() {
  const offered = new Set(state.config.materials.map((m) => m.id));
  return state.settings.materials.filter((m) => offered.has(m.id));
}

function printerOf() {
  return state.settings.printers.find((p) => p.id === state.printerId) || state.settings.printers[0];
}

/** The loaded filament, reconciled to what the chosen machine can actually hold. */
function liveSlots() {
  const printer = printerOf();
  return reconcileSlots(
    state.slots || defaultSlots(printer, state.materialId),
    printer, allowedMaterials(),
  ).slots;
}

function toLine(part) {
  return {
    quantity: part.quantity,
    profileId: part.profileId,
    printerId: state.printerId,
    geometry: part.geometry,
    // The colours belong to the bed; the mix says how much of each is this part.
    mix: part.mix,
    needsSupport: part.needsSupport,
    hardware: (part.hardware || []).filter((h) => h.hardwareId),
    name: part.modelName || 'Part',
  };
}

function price() {
  const printer = printerOf();
  const slots = state.slots || defaultSlots(printer, state.materialId);
  return calculateOrder({
    plate: { printerId: state.printerId, slots },
    lines: state.parts.map((p) => toLine(p)),
    shippingMethodId: state.shippingMethodId,
    extras: [],
  }, state.settings, { internal: !!state.config?.internal });
}

function quotedTotal(result) {
  // The parts price is padded by the company's quote buffer so the real invoice,
  // priced from the sliced parts, tends to come in under this figure. An internal
  // link carries no buffer — it shows the bare cost.
  const buffer = state.config?.internal ? 0 : Math.max(0, num(state.config.quoteBuffer, 0));
  return result.totals.finalInvoice + result.parts.total * buffer;
}

/** The material a part is mostly made of, for the request handed to the company. */
function partMaterialId(part, slots) {
  const norm = normaliseMix(part.mix, slots);
  const top = [...norm.entries].sort((a, b) => b.percent - a.percent)[0];
  const slot = slots.find((s) => s.id === top?.slotId);
  return slot?.materialId || slots[0]?.materialId || state.materialId;
}

async function loadModel(file, part, rerender) {
  try {
    const mesh = await readMesh(file.name, await file.arrayBuffer(), { inflate: platformInflate });
    part.geometry = analyse(mesh);
    part.modelName = file.name;
    toast(`${file.name} measured`);
    rerender();
  } catch (error) {
    toast(error.message || 'That file could not be read');
  }
}

function dropzone(part, rerender) {
  const input = el('input', {
    type: 'file',
    class: 'visually-hidden',
    accept: '.stl,.obj,.3mf',
    'data-field': `portal-file-${part.id}`,
    on: {
      change: (e) => { const f = e.target.files?.[0]; if (f) loadModel(f, part, rerender); },
    },
  });
  const zone = el('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    'data-field': `portal-drop-${part.id}`,
    on: {
      click: () => input.click(),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      dragover: (e) => { e.preventDefault(); zone.classList.add('is-over'); },
      dragleave: () => zone.classList.remove('is-over'),
      drop: (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
        const f = e.dataTransfer?.files?.[0];
        if (f) loadModel(f, part, rerender);
      },
    },
  }, [
    el('strong', { text: part.modelName || 'Drop your STL, OBJ or 3MF here' }),
    el('span', {
      class: 'dropzone__hint',
      text: 'or click to choose a file — it is measured in your browser and never uploaded',
    }),
    input,
  ]);
  return zone;
}

/** A plain labelled text input that stores on change without re-rendering. */
function textInput(id, label, value, onChange, type = 'text') {
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', text: label, for: id }),
    el('input', {
      class: 'input', id, type, 'data-field': id, value: value || '',
      on: { change: (e) => onChange(e.target.value) },
    }),
  ]);
}

/** The structured delivery address: a type, its extra line, then the common lines. */
function addressBlock() {
  const a = state.customer.addressParts;
  const set = (key) => (v) => { a[key] = v; };
  const rows = [
    selectField('portal-addr-type', 'Address type',
      ADDRESS_TYPES.map((t) => ({ value: t.id, label: t.name })),
      a.type, (v) => { a.type = v; render(); }),
  ];
  if (a.type === 'complex') {
    rows.push(el('div', { class: 'field-grid' }, [
      textInput('portal-addr-unit', 'Unit / door number', a.unit, set('unit')),
      textInput('portal-addr-complex', 'Complex / estate name', a.complex, set('complex')),
    ]));
  }
  if (a.type === 'business') {
    rows.push(textInput('portal-addr-business', 'Business name', a.business, set('business')));
  }
  rows.push(textInput('portal-addr-street', 'Street number and name', a.street, set('street')));
  rows.push(el('div', { class: 'field-grid' }, [
    textInput('portal-addr-area', 'Suburb / area', a.area, set('area')),
    textInput('portal-addr-city', 'City / town', a.city, set('city')),
  ]));
  rows.push(el('div', { class: 'field-grid' }, [
    textInput('portal-addr-province', 'Province', a.province, set('province')),
    textInput('portal-addr-postal', 'Postal code', a.postalCode, set('postalCode')),
  ]));
  rows.push(textInput('portal-addr-country', 'Country', a.country, set('country')));
  return el('div', {}, rows);
}

/** One part's whole editor: model, what it is for, its colour mix and how many. */
function partPanel(ctx, part, index, line) {
  const { config, slots, materials, code, buffer, canRemove } = ctx;
  const mixNodes = mixEditor({
    slots,
    materials,
    mix: part.mix,
    partName: part.modelName || 'this part',
    keyPrefix: `portal-mix-${part.id}`,
    onMix: (next) => { part.mix = next; render(); },
  });

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h2', { text: `Part ${index + 1}` }),
      canRemove
        ? button('Remove', () => { state.parts.splice(index, 1); render(); },
          { key: `portal-remove-${part.id}`, danger: true })
        : null,
    ]),
    dropzone(part, render),
    part.geometry ? el('dl', { class: 'facts' }, [
      el('dt', { text: 'Size' }), el('dd', { class: 'value', text: fmtSize(part.geometry.size) }),
      el('dt', { text: 'Volume' }), el('dd', { class: 'value', text: `${mm3ToCm3(part.geometry.volume).toFixed(2)} cm³` }),
    ]) : muted('Without a model this part is priced from a nominal 50 mm cube.'),
    part.geometry && !part.geometry.watertight
      ? banner('warn', 'This model has holes in its surface, so the volume is an estimate. '
        + 'We will check it before confirming a price.')
      : null,
    line && !line.fit.fits
      ? banner('danger', 'This part is larger than the machine it would print on. Send it over '
        + 'anyway — it may be possible to split it.')
      : null,

    el('h3', { text: 'What is it for?' }),
    chips(`portal-profile-${part.id}`,
      config.profiles.map((p) => ({ value: p.id, label: p.name, title: p.blurb })),
      part.profileId, (v) => { part.profileId = v; render(); }),
    muted(config.profiles.find((p) => p.id === part.profileId)?.blurb || ''),

    // With one colour loaded there is nothing to mix, so this is empty and the
    // part simply prints in that colour - exactly as the estimator behaves.
    ...mixNodes,

    numberField(`portal-qty-${part.id}`, 'How many', part.quantity,
      (v) => { part.quantity = Math.max(1, Math.round(num(v, 1))); render(); }, {
        min: 1, step: 1, hint: 'More of the same part costs less each.',
      }),
    checkField(`portal-support-${part.id}`, 'This part needs support removed',
      part.needsSupport, (v) => { part.needsSupport = v; render(); }, {
        hint: 'Tick if the shape overhangs and will print with support that has to be cleaned off.',
      }),

    ...hardwareEditor(part, config),

    line
      ? muted(`About ${fmtMoney(line.unitPrice * (1 + buffer), code)} each · `
        + `${line.perPlate} per plate · ${line.jobs} plate${line.jobs === 1 ? '' : 's'}`)
      : null,

    savingsFor(part),
  ].filter(Boolean));
}

/** The "fill a plate and save" chart for one part, priced on its own. */
function savingsFor(part) {
  try {
    const saving = plateSaving(toLine(part), state.settings, {
      plate: { printerId: state.printerId, slots: liveSlots() },
    });
    const buffer = Math.max(0, num(state.config.quoteBuffer, 0));
    return savingsChart(saving, state.settings.currencyCode, { buffer });
  } catch {
    return null;
  }
}

/**
 * Let the customer ask for embedded hardware - a magnet, an insert, an NFC tag.
 * Shown to everyone, because "I want a magnet in it" is exactly the kind of thing
 * the person who saw a part online asks for; it is not an advanced setting.
 */
function hardwareEditor(part, config) {
  const catalogue = config.hardware || [];
  if (!catalogue.length) return [];
  if (!Array.isArray(part.hardware)) part.hardware = [];

  const rows = part.hardware.map((entry, hi) => el('div', { class: 'row-editor' }, [
    selectField(`portal-hw-${part.id}-${hi}`, '',
      catalogue.map((h) => ({ value: h.id, label: h.name })),
      entry.hardwareId || catalogue[0].id, (v) => { entry.hardwareId = v; render(); }),
    numberField(`portal-hwqty-${part.id}-${hi}`, '', entry.qty ?? 1,
      (v) => { entry.qty = Math.max(1, Math.round(num(v, 1))); render(); }, { min: 1, step: 1 }),
    button('Remove', () => { part.hardware.splice(hi, 1); render(); },
      { key: `portal-hwrm-${part.id}-${hi}`, danger: true }),
  ]));

  return [
    el('h3', { text: 'Anything embedded in it?' }),
    part.hardware.length
      ? el('div', {}, rows)
      : muted('Magnets, threaded inserts, an NFC tag — added during the print. Skip this if the '
        + 'part is just plastic.'),
    button('Add hardware', () => { part.hardware.push({ hardwareId: catalogue[0].id, qty: 1 }); render(); },
      { key: `portal-hwadd-${part.id}` }),
  ];
}

function requestText(result) {
  const code = result.currencyCode;
  const addr = formatAddress(state.customer.addressParts);
  const out = [
    `Quote request for ${state.config.company.name}`,
    '',
    `Name: ${state.customer.name || '(not given)'}`,
    `Email: ${state.customer.email || '(not given)'}`,
    state.customer.phone ? `Phone: ${state.customer.phone}` : '',
    addr ? `Deliver to:\n${addr.split('\n').map((l) => `  ${l}`).join('\n')}` : '',
    '',
    'Parts:',
  ];
  result.lines.forEach((line, i) => {
    out.push(`  ${i + 1}. ${line.name} — ${line.quantity} × ${line.profile.name}, `
      + `${line.material.name} ${line.material.colour}`);
  });
  out.push('',
    `Printer requested: ${result.lines[0]?.printer.name || 'any suitable'}`,
    `Delivery: ${result.shipping.method?.name || 'to be confirmed'}`
      + ` — ${fmtMoney(result.orderExtras.shipping + result.orderExtras.packaging, code)}`
      + `${result.shipping.free ? ' (delivery free, packaging charged)' : ''}`,
    '',
    `Indicative total: ${fmtMoney(quotedTotal(result), code)} for ${result.unitCount} part`
      + `${result.unitCount === 1 ? '' : 's'}`,
    `Lead time: about ${result.capacity.leadDays} working days`,
    '',
    state.customer.notes ? `Notes: ${state.customer.notes}` : '',
    '',
    'This price was worked out in my browser from the form you sent and is',
    'subject to your confirmation.');
  return out.filter((l) => l !== '').join('\n');
}

function render() {
  const host = document.getElementById('portal');
  // The portal rebuilds the whole page on every edit — the same one render path
  // the internal app uses — so it must not throw away where the reader was
  // scrolled to or which field they had focus in. Adding a head or a part four
  // panels down otherwise snaps the page to the top (pitfalls #21).
  const snapshot = captureFocus({ page: document.scrollingElement });
  clear(host);

  if (!state.config) {
    host.appendChild(emptyState(
      'This form has not been set up yet. Open 3DPrintCost Bench, turn the customer '
      + 'form on in Settings, and use the link it gives you.',
      el('a', { class: 'btn btn-primary', href: 'index.html', text: 'Open 3DPrintCost Bench' }),
    ));
    return;
  }

  const config = state.config;
  const result = price();
  const code = result.currencyCode;
  const quoted = quotedTotal(result);
  const belowMinimum = quoted < num(config.minimumOrder);
  const materials = allowedMaterials();
  const slots = liveSlots();
  const printer = printerOf();
  const deliveryTotal = result.orderExtras.shipping + result.orderExtras.packaging;
  const internal = !!config.internal;
  const buffer = internal ? 0 : Math.max(0, num(config.quoteBuffer, 0));
  const validityDays = Math.max(1, Math.round(num(config.quoteValidityDays, 30)));
  const validUntil = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  const partCtx = { config, slots, materials, code, buffer, canRemove: state.parts.length > 1 };

  const nodes = [
    el('div', { class: 'panel' }, [
      el('h1', { class: 'portal__title', text: internal
        ? `Internal cost — ${config.company.name}` : `Get a price from ${config.company.name}` }),
      muted(internal
        ? 'Internal cost estimate for staff — the physical cost only (material, machine, '
          + 'electricity, allowances), with no labour and no profit. Everything happens in your '
          + 'browser; nothing is uploaded.'
        : 'Add one part or several — each with its own model, finish, colours and quantity. '
          + 'Everything on this page happens in your own browser; your models are measured '
          + 'here and never uploaded.'),
    ]),
  ];

  state.parts.forEach((part, i) => {
    nodes.push(partPanel(partCtx, part, i, result.lines[i]));
  });

  nodes.push(el('div', { class: 'panel' }, [
    buttonRow([button('Add another part', () => {
      state.parts.push(makePortalPart({ profileId: config.profiles[0]?.id }));
      render();
    }, { key: 'portal-add-part' })]),
  ]));

  // The printer and the colours loaded on it belong to the bed, shared by every
  // part above - the same shape the internal estimator uses.
  nodes.push(el('div', { class: 'panel' }, [
    el('h2', { text: 'Printer and colours' }),
    config.printers.length > 1
      ? selectField('portal-printer', 'Printer',
        config.printers.map((p) => ({ value: p.id, label: p.name })),
        state.printerId, (v) => { state.printerId = v; state.slots = null; render(); })
      : muted(`Printed on the ${config.printers[0]?.name || printer.name}.`),
    ...filamentSlots({
      printer,
      slots,
      materials,
      countryId: config.countryId,
      currencyCode: code,
      keyPrefix: 'portal-bed',
      showDetail: false,
      onSlots: (next) => {
        state.slots = next;
        state.materialId = next[0]?.materialId || state.materialId;
        render();
      },
    }),
    muted('Load the colours you want. On a part with more than one loaded, say how much of '
      + 'each it is in that part above.'),
  ]));

  nodes.push(el('div', { class: 'panel' }, [
    el('h2', { text: 'Delivery' }),
    selectField('portal-shipping', 'How should it reach you?',
      [{ value: 'auto', label: 'Cheapest that fits' },
        ...config.shipping.map((m) => ({ value: m.id, label: `${m.name} — about ${m.days} days` }))],
      state.shippingMethodId, (v) => { state.shippingMethodId = v; render(); }),
  ]));

  const totalPlates = result.lines.reduce((m, l) => Math.max(m, l.jobs), 0);
  nodes.push(el('div', { class: 'panel panel--price' }, [
    el('h2', { text: 'Your price' }),
    result.lines.length > 1
      ? table([
        { label: 'Part', get: (l) => l.name },
        { label: 'Qty', align: 'right', mono: true, get: (l) => String(l.quantity) },
        { label: 'Each', align: 'right', mono: true, get: (l) => fmtMoney(l.unitPrice * (1 + buffer), code) },
        { label: 'Line', align: 'right', mono: true, get: (l) => fmtMoney(l.lineTotal * (1 + buffer), code) },
      ], result.lines)
      : null,
    el('div', { class: 'three-numbers' }, [
      statTile(`${result.unitCount} part${result.unitCount === 1 ? '' : 's'}`,
        fmtMoney(result.parts.total * (1 + buffer), code),
        { hint: `${totalPlates} plate${totalPlates === 1 ? '' : 's'} in all`, big: true }),
      statTile('Delivery and packing', fmtMoney(deliveryTotal, code), {
        hint: [
          result.shipping.method?.name || 'to be confirmed',
          result.shipping.free ? 'delivery free' : null,
        ].filter(Boolean).join(' · '),
        big: true,
      }),
      statTile('Total', fmtMoney(quoted, code), {
        hint: `about ${result.capacity.leadDays} working days`, big: true, tone: 'ok',
      }),
    ]),
    result.shipping.free
      ? banner('ok', deliveryTotal > 0
        ? `Delivery is free on this order — the ${fmtMoney(deliveryTotal, code)} above is packaging.`
        : 'This order qualifies for free delivery.')
      : (result.shipping.freeRule.threshold > 0
        ? muted(`Delivery is free on part orders over ${fmtMoney(result.shipping.freeRule.threshold, code)}.`)
        : null),
    belowMinimum
      ? banner('warn', `The minimum order is ${fmtMoney(config.minimumOrder, code)}. `
        + 'Send the request anyway and we will come back to you.')
      : null,
    muted(config.leadTimeNote),
    internal
      ? banner('info', 'Internal cost only — labour and profit are excluded. This is an estimate '
        + 'from the model’s shape; the exact figure is known once the part is sliced.')
      : banner('info', 'This is a quotation only. The price is estimated from the shape of your '
        + 'models; the exact figures can only be worked out once the parts have been prepared and '
        + 'sliced for printing. The confirmed invoice is usually at or below this quote.'),
    internal ? null
      : banner('warn', `This quote is valid for ${validityDays} day${validityDays === 1 ? '' : 's'} `
        + `from when you download it — until ${validUntil.toLocaleDateString()}. Prices change, so `
        + 'after that please export a fresh quote from the latest link.'),
  ].filter(Boolean)));

  // Expedite: if the company allows it, the client can pay the (padded) estimate
  // now and skip the quote entirely. In 'only' mode there is no quote path at all.
  const expediteMode = internal ? 'off' : (config.expediteMode || 'off');
  if (expediteMode !== 'off') {
    nodes.push(el('div', { class: 'panel' }, [
      el('h2', { text: 'Expedite your order' }),
      expediteMode === 'only'
        ? banner('info', `To confirm this order, pay ${fmtMoney(quoted, code)} and attach proof of `
          + 'payment when you send it. There is no separate quote — once payment is verified your '
          + 'order goes straight into production. The estimate is set to come in at or above the '
          + 'final cost, so you are never asked for more.')
        : checkField('portal-expedite',
          `Expedite — pay ${fmtMoney(quoted, code)} now and skip the quote`,
          state.expedite, (v) => { state.expedite = v; render(); }, {
            hint: 'Happy with this estimate? Pay it now and attach proof of payment, and we skip '
              + 'the quote and go straight to production. The estimate is set at or above the final '
              + 'cost, so you will never be asked for more.',
          }),
    ]));
  }

  const makePayload = () => portalRequest({
    company: state.config.company,
    printerId: state.printerId,
    expedited: expediteMode === 'only' ? true : !!state.expedite,
    // The loaded filament travels with the request, so the workshop opens it
    // with every head already filled in with the colours the customer chose.
    slots: slots.map((s) => ({ ...s })),
    parts: state.parts.map((p) => ({
      modelName: p.modelName,
      quantity: p.quantity,
      profileId: p.profileId,
      printerId: state.printerId,
      materialId: partMaterialId(p, slots),
      geometry: p.geometry,
      needsSupport: p.needsSupport,
      // This part's share of each loaded spool, keyed to the slots above.
      mix: p.mix,
      colours: Math.max(1, normaliseMix(p.mix, slots).entries.filter((e) => e.percent > 0).length),
    })),
    customer: state.customer,
    order: { shippingMethodId: state.shippingMethodId },
    quotedTotal: quoted,
    currencyCode: code,
    validityDays,
  });

  // A request link: the whole request in a URL the customer sends, that opens
  // the workshop's app and imports it in one tap. Only the model's measurements
  // travel, not the mesh, so the link stays short - and it is the easiest
  // hand-off from a phone, where attaching a file is awkward.
  const requestLink = () => {
    const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}index.html`;
    return `${base}#${encodeURIComponent(JSON.stringify(makePayload()))}`;
  };

  nodes.push(el('div', { class: 'panel' }, [
    el('h2', { text: 'Send it over' }),
    muted('This page has no server, so it cannot send the request for you. On a phone the '
      + 'easiest way is the request link — copy it and send it to us in an email or a message. '
      + 'Either way, attach your model file so we can print it.'),
    (expediteMode === 'only' || state.expedite)
      ? banner('warn', 'This is an expedited order — attach your proof of payment along with your '
        + 'model file(s) so we can confirm and start production.')
      : null,
    el('div', { class: 'field-grid' }, [
      textInput('portal-name', 'Your name', state.customer.name, (v) => { state.customer.name = v; }),
      textInput('portal-email', 'Your email', state.customer.email, (v) => { state.customer.email = v; }, 'email'),
    ]),
    textInput('portal-phone', 'Phone', state.customer.phone, (v) => { state.customer.phone = v; }),
    el('h3', { text: 'Delivery address' }),
    addressBlock(),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: 'Anything we should know', for: 'p-notes' }),
      el('textarea', {
        class: 'input input--area', id: 'p-notes', 'data-field': 'portal-notes',
        on: { change: (e) => { state.customer.notes = e.target.value; } },
      }),
    ]),
    buttonRow([
      button('Copy a request link', () => {
        const link = requestLink();
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(link)
            .then(() => toast('Link copied — send it to us, and attach your model file'))
            .catch(() => toast('Could not copy the link'));
        } else toast('Copying is not available here; use Download instead');
      }, { primary: true, key: 'portal-link' }),
      button('Download the request', () => {
        download(new Blob([JSON.stringify(makePayload(), null, 2)], { type: 'application/json' }),
          'quote-request.json');
        toast('Saved — email this file to us with your models');
      }, { key: 'portal-download' }),
      config.company.email
        ? el('a', {
          class: 'btn',
          'data-field': 'portal-email-link',
          href: `mailto:${config.company.email}?subject=${encodeURIComponent('Quote request')}`
            + `&body=${encodeURIComponent(`${requestText(result)}\n\nRequest link (open to import):\n${requestLink()}`)}`,
          text: 'Open in your email',
        })
        : null,
    ]),
  ]));

  nodes.push(el('footer', { class: 'app-footer' }, [
    el('span', {
      text: 'Nothing on this page is uploaded. Your models, your details and this price '
        + 'stay in your browser.',
    }),
    el('nav', {}, [el('span', { class: 'muted', text: `v${PORTAL_VERSION}` })]),
  ]));

  for (const node of nodes) if (node) host.appendChild(node);
  capDiagramScale(host);
  restoreFocus(snapshot, { page: document.scrollingElement });
}

function init() {
  const config = loadConfig();
  state.config = config;
  if (config) {
    state.settings = config.settings;
    state.printerId = config.printers[0]?.id || state.settings.printers[0].id;
    state.materialId = config.materials[0]?.id || state.settings.materials[0].id;
    state.slots = null;
    state.parts = [makePortalPart({ profileId: config.profiles[0]?.id || state.settings.profiles[0].id })];
    state.shippingMethodId = 'auto';
    // In expedite-only mode there is no quote path, so the order is expedited
    // from the start; in optional mode the client turns it on themselves.
    state.expedite = config.expediteMode === 'only';
    state.customer.addressParts.country = state.settings.countries
      .find((c) => c.id === config.countryId)?.name || '';
    document.title = `Get a price — ${config.company.name}`;
  }
  render();
}

// This module runs when it loads, so it must never be imported by another page.
// The guard is the second line of defence; the first is that `portalLink` lives
// in its own file precisely so nobody has a reason to import this one.
if (typeof document !== 'undefined' && document.getElementById('portal')) init();
