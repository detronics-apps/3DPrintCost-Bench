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
  numberField, selectField, checkField, textField, chips, button, buttonRow, banner, statTile, table, muted, emptyState, section,
} from './controls.js';
import { readMesh } from '../mesh.js';
import { platformInflate } from '../zip.js';
import { analyse, fmtSize, mm3ToCm3 } from '../geometry.js';
import { calculateOrder } from '../engine.js';
import { migrateSettings } from '../settings.js';
import { defaultSlots, reconcileSlots, normaliseMix } from '../filaments.js';
import { fmtMoney, num } from '../money.js';
import { portalConfig, settingsFromConfig } from '../portal-config.js';
import { gateMatches, entryPostOps } from '../postprocessing.js';
import { validateEmail, validatePhone, dialInfoFor, formatPhone } from '../phone.js';
import { packageFits } from '../shipping.js';
import { radarChart } from './svg/radar.js';
import { portalRequest } from '../portal-request.js';
import { makeAddressParts, formatAddress, ADDRESS_TYPES } from '../projects.js';
import { filamentSlots, mixEditor } from './filament-slots.js';
import { bedPlan, bedTowerFootprint } from './svg/bed.js';
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
    // Post-processing chosen for this part, { [operationId]: true } for the
    // whole-part ops; per-component ops (fit) store on the component entry.
    postProcessing: {},
    nfcUrl: '',
    // The part must fit/mate with another part — flags that a dimensioned drawing
    // is needed to hold the critical dimensions.
    mustFit: false,
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
  // Set true the first time the client presses a send button while the form is
  // invalid, so empty required fields go red (they stay neutral before that).
  submitAttempted: false,
  parts: [makePortalPart()],
  customer: {
    // Name is split into first name + surname; `name` is kept as the composed
    // value so everything downstream (payload, dedup, documents) is unchanged.
    firstName: '', surname: '', name: '',
    email: '', phone: '', countryId: null, newsletter: false,
    // A business can add a VAT number for its invoice; the flag also defaults
    // the delivery address to a business address (still changeable).
    isBusiness: false, vatNumber: '',
    notes: '', addressParts: makeAddressParts(),
  },
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
    postProcessing: part.postProcessing,
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

/**
 * A text field that turns green when its value is valid and red (with a message)
 * when it is wrong, and marks a required field with an asterisk. Red is only
 * shown once `error` is passed; green whenever `valid` is true.
 */
function validatedInput(id, label, value, onChange, options = {}) {
  const {
    type = 'text', required = false, valid = false, error = null, hint = null,
  } = options;
  const cls = error ? 'field field--error' : (valid ? 'field field--valid' : 'field');
  return el('div', { class: cls }, [
    el('label', { class: 'field__label', for: id }, [
      el('span', { text: label }),
      required ? el('span', { class: 'field__req', text: ' *' }) : null,
    ].filter(Boolean)),
    el('input', {
      class: 'input', id, type, 'data-field': id, value: value || '',
      on: { change: (e) => onChange(e.target.value) },
    }),
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
    error ? el('div', { class: 'field__error', text: error }) : null,
  ].filter(Boolean));
}

/** A per-part line for the confirmation summary: what they chose, in words. */
function orderSummaryNodes() {
  const config = state.config || {};
  const ops = config.pricing?.postProcessing?.ops || [];
  const catalogue = config.pricing?.hardware || [];
  const opName = (id) => ops.find((o) => o.id === id)?.name || id;
  const hwName = (id) => catalogue.find((h) => h.id === id)?.name || id;

  return state.parts.map((p, i) => {
    const comps = (p.hardware || []).filter((h) => h.hardwareId)
      .map((h) => `${Math.max(1, num(h.qty, 1))}× ${hwName(h.hardwareId)}`);
    const wholeOps = Object.keys(p.postProcessing || {})
      .filter((k) => p.postProcessing[k]).map(opName);
    const compOps = [];
    for (const h of p.hardware || []) {
      for (const opId of Object.keys(entryPostOps(h))) {
        compOps.push(`${opName(opId)} the ${hwName(h.hardwareId).toLowerCase()}`);
      }
    }
    const finishing = [...wholeOps, ...compOps];
    return el('div', { class: 'summary-part' }, [
      el('strong', { text: `${p.modelName || `Part ${i + 1}`} × ${Math.max(1, num(p.quantity, 1))}` }),
      comps.length ? el('div', { class: 'muted', text: `Components: ${comps.join(', ')}` }) : null,
      el('div', { class: 'muted', text: finishing.length ? `Finishing: ${finishing.join(', ')}` : 'No post-processing' }),
    ].filter(Boolean));
  });
}

/** The context-aware warnings shown in the confirmation summary. */
function orderNoteNodes() {
  const catalogue = state.config?.pricing?.hardware || [];
  const specOf = (e) => catalogue.find((h) => h.id === e.hardwareId);
  const notes = [];

  if (state.parts.some((p) => p.mustFit)) {
    notes.push(['warn', 'You marked a part as having to fit another part. Attach a technical '
      + 'drawing or photo with the critical dimensions when you send this — without it we cannot '
      + 'promise it will match.']);
  }

  const anyPost = state.parts.some((p) => Object.keys(p.postProcessing || {}).some((k) => p.postProcessing[k])
    || (p.hardware || []).some((h) => Object.keys(entryPostOps(h)).length));
  if (!anyPost) {
    notes.push(['warn', 'No post-processing was selected. If a print needs finishing — support '
      + 'removed, for instance — it will not be done unless you add it. Is that right?']);
  }

  if (state.shippingMethodId === 'collect') {
    const totalParts = state.parts.reduce((n, p) => n + Math.max(1, num(p.quantity, 1)), 0);
    let m = 'You have chosen to collect this yourself, with no packaging — you will receive the '
      + 'parts as they come off the printer.';
    if (totalParts > 2) m += ' With several parts, you might want a box to carry them — ask us if so.';
    notes.push(['info', m]);
  }

  const loose = [];
  for (const p of state.parts) {
    for (const h of p.hardware || []) {
      const spec = specOf(h);
      if (spec && spec.stage === 'after' && num(h.qty, 1) > 0 && entryPostOps(h).fit !== true) {
        loose.push(spec.name.toLowerCase());
      }
    }
  }
  if (loose.length) {
    const names = [...new Set(loose)];
    const plural = loose.length > 1;
    notes.push(['warn', `You added ${names.join(', ')} but have not chosen to have ${plural ? 'them' : 'it'} `
      + `fitted, so ${plural ? 'they' : 'it'} will ship loose in the box for you to install.`]);
  }
  return notes.map(([lvl, text]) => banner(lvl, text));
}

/** Confirm-before-send: a summary of the order with any warnings, then send. */
function showConfirmSummary(onConfirm) {
  const overlay = el('div', { class: 'modal-overlay', 'data-field': 'portal-confirm' }, [
    el('div', { class: 'modal' }, [
      el('h2', { text: 'Please check your order' }),
      muted('Here is what you have asked for. If it looks right, send it over.'),
      el('div', { class: 'summary-parts' }, orderSummaryNodes()),
      ...orderNoteNodes(),
      buttonRow([
        button('Back — let me change something', () => overlay.remove(), { key: 'summary-back' }),
        button('Yes, this is right — send it', () => { overlay.remove(); onConfirm(); },
          { primary: true, key: 'summary-confirm' }),
      ]),
    ]),
  ]);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/** Scroll to the first field with a problem and focus it, for the sanity check. */
function focusFirstInvalid(valid) {
  const order = ['portal-firstname', 'portal-surname', 'portal-email', 'portal-phone', 'portal-addr-street'];
  const map = {
    'portal-firstname': 'firstName', 'portal-surname': 'surname', 'portal-email': 'email',
    'portal-phone': 'phone', 'portal-addr-street': 'address',
  };
  const id = order.find((f) => valid.errors[map[f]]);
  const node = id && document.querySelector(`[data-field="${id}"]`);
  if (node) {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.focus?.();
  }
}

/**
 * What is still needed before the request can be sent. Email and phone are
 * always required; the address only when the order is being delivered (a
 * customer collecting it needs none). Errors are keyed by field.
 */
function customerValidity(config) {
  const c = state.customer;
  const country = c.countryId || config.countryId;
  const email = validateEmail(c.email);
  const phone = validatePhone(c.phone, country);
  const needsAddress = state.shippingMethodId !== 'collect';
  const a = c.addressParts || {};
  const addressOk = !needsAddress || [a.street, a.city].some((v) => String(v ?? '').trim());

  const errors = {};
  if (!String(c.firstName || '').trim()) errors.firstName = 'Enter your first name.';
  if (!String(c.surname || '').trim()) errors.surname = 'Enter your surname.';
  if (!email.ok) errors.email = email.message;
  if (!phone.ok) errors.phone = phone.message;
  if (needsAddress && !addressOk) {
    errors.address = 'Add a delivery address, or choose to collect it yourself.';
  }
  return {
    errors, ok: Object.keys(errors).length === 0, needsAddress, email, phone,
  };
}

/**
 * Two things worth knowing before sending: what the model file carries (colour),
 * and what a reprint can and cannot fix. Collapsed, so it is there to read
 * without being in the way.
 */
function goodToKnow() {
  return section('portal-goodtoknow', 'Good to know before you send', [
    el('h3', { text: 'What the print types balance' }),
    muted('The “What is it for?” choice on each part tips a balance between four things, and '
      + 'leaning into one gives a little up on the others: Speed (how quickly and cheaply it comes '
      + 'off the machine), Cost, Strength (how tough and load-bearing), and Precision (dimensional '
      + 'accuracy and surface finish). On our ratings a higher score is always better for you — a '
      + 'Cost of 5 means cheapest, a Cost of 1 the most expensive.'),
    muted('Roughly: Strength maxes out toughness (more material and time, so slower and pricier); '
      + 'Function is the solid everyday balance; Visual puts the finish first; and Display only is '
      + 'the fastest and cheapest, for something that is looked at rather than used. If a part has '
      + 'to fit or carry a load, say so — tick “must fit another part” above, or pick Strength, so '
      + 'we do not optimise it for looks or price at the cost of what you actually need.'),
    el('h3', { text: 'Your model file — .stl vs .3mf' }),
    muted('A .3mf file carries your colours and print settings; an .stl is the shape only. If your '
      + 'part is meant to be more than one colour and you send an .stl, we cannot see the colours — '
      + 'we would need a reference image and would add time to paint it. Sending a .3mf with the '
      + 'colours already set avoids that extra cost.'),
    el('h3', { text: 'What a reprint can and cannot fix' }),
    muted('If a print fails because of our printer, that is on us — we reprint it at no charge. But '
      + 'if it fails because of the part\'s own shape or the settings it needs, reprinting the same '
      + 'file the same way gives the same result: a very thin, tall feature (say a 3 mm tower 150 mm '
      + 'high) will tend to fail however many times we run it, and layer lines on a shallow top curve '
      + 'look the same on every print. Where that is likely, we will tell you and suggest a design or '
      + 'setting change rather than reprint the same outcome.'),
  ], { open: false });
}

/**
 * A short, honest privacy notice. The form uploads nothing — the details are
 * packaged into a file/link the client sends — but the company does store what
 * it receives to fulfil the order, so both facts are stated. Collapsed by
 * default so it is available without getting in the way.
 */
function privacyNotice(config) {
  const who = config.company?.name || 'the workshop';
  const contact = config.company?.email || config.company?.phone || `${who}`;
  return section('portal-privacy', 'How we handle your details (privacy)', [
    muted(`What we collect: your name and contact details, a delivery address (only if we ship to `
      + `you), and a VAT number only if you tell us you are a business.`),
    muted(`Why: to prepare your quote and, if you go ahead, to make and deliver your order.`),
    muted('This form does not upload anything. Your details are packaged into the file or link '
      + `you choose to send us; ${who} then stores them on its own device to process your order — `
      + 'they are not held on any website or shared with anyone else.'),
    muted('This page uses no cookies, no tracking and no third-party services. We only add you to '
      + 'any newsletter if you tick the box yourself.'),
    muted(`To see, correct or delete the details we hold about you, contact us at ${contact}.`),
  ], { open: false });
}

/** Keep the composed `name` in step with the split first name + surname. */
function composeCustomerName() {
  const c = state.customer;
  c.name = `${String(c.firstName || '').trim()} ${String(c.surname || '').trim()}`.trim();
}

/** Fill the customer fields from a details file the client saved earlier. */
function loadClientDetails() {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const cust = data && data.kind === 'client' ? data.customer
        : (data && (data.customer || (data.name || data.email ? data : null)));
      if (!cust) { toast('That file has no saved details in it'); return; }
      const c = state.customer;
      // Accept a saved file with either the split names or just a composed name.
      c.firstName = cust.firstName || (cust.name ? String(cust.name).split(' ')[0] : '') || '';
      c.surname = cust.surname || (cust.name ? String(cust.name).split(' ').slice(1).join(' ') : '') || '';
      c.name = cust.name || `${c.firstName} ${c.surname}`.trim();
      c.email = cust.email || '';
      c.phone = cust.phone || '';
      c.countryId = cust.countryId || null;
      c.newsletter = !!cust.newsletter;
      c.isBusiness = !!cust.isBusiness || !!cust.vatNumber;
      c.vatNumber = cust.vatNumber || '';
      c.notes = cust.notes || '';
      c.addressParts = makeAddressParts(cust.addressParts || {});
      toast('Your details are filled in');
      render();
    } catch {
      toast('Could not read that file');
    }
  });
  input.click();
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
  // The country is chosen once by the picker above (it also sets the dialling
  // code), so it is not repeated here.
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
    (() => {
      const chosen = config.profiles.find((p) => p.id === part.profileId);
      return chosen?.scores
        ? el('div', { class: 'radar' }, [radarChart(chosen.scores, { size: 210 })])
        : null;
    })(),

    checkField(`portal-mustfit-${part.id}`, 'This part must fit or mate with another part',
      part.mustFit, (v) => { part.mustFit = v; render(); }, {
        hint: 'Tick if it has to fit into or onto something at set dimensions.',
      }),
    part.mustFit
      ? banner('info', 'Please attach a technical drawing or a photo marking the critical '
        + 'dimensions to match (with a ruler or figures), so we can hold those tolerances. '
        + 'A printed part is only as accurate as the dimensions we are given.')
      : null,

    // With one colour loaded there is nothing to mix, so this is empty and the
    // part simply prints in that colour - exactly as the estimator behaves.
    ...mixNodes,

    numberField(`portal-qty-${part.id}`, 'How many', part.quantity,
      (v) => { part.quantity = Math.max(1, Math.round(num(v, 1))); render(); }, {
        min: 1, step: 1, hint: 'More of the same part costs less each.',
      }),

    ...hardwareEditor(part, config),

    portalPostProcessing(part, config),

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
/**
 * An after-print component is fitted by default — nobody is surprised that the
 * inserts they ordered were installed — so a fresh after-print entry gets its
 * fit ticked. The client can untick it to have it shipped loose. A component
 * whose fit has already been decided (ops present) is left as it is.
 */
function defaultFitFor(entry, config) {
  const spec = (config.pricing?.hardware || []).find((h) => h.id === entry.hardwareId);
  if (spec && spec.stage === 'after' && !('ops' in entry) && entry.fit === undefined) {
    entry.ops = { fit: true };
  }
}

function hardwareEditor(part, config) {
  const catalogue = config.hardware || [];
  if (!catalogue.length) return [];
  if (!Array.isArray(part.hardware)) part.hardware = [];

  const rows = part.hardware.map((entry, hi) => el('div', { class: 'row-editor' }, [
    selectField(`portal-hw-${part.id}-${hi}`, '',
      catalogue.map((h) => ({ value: h.id, label: h.name })),
      entry.hardwareId || catalogue[0].id, (v) => { entry.hardwareId = v; defaultFitFor(entry, config); render(); }),
    numberField(`portal-hwqty-${part.id}-${hi}`, '', entry.qty ?? 1,
      (v) => { entry.qty = Math.max(1, Math.round(num(v, 1))); render(); }, { min: 1, step: 1 }),
    button('Remove', () => { part.hardware.splice(hi, 1); render(); },
      { key: `portal-hwrm-${part.id}-${hi}`, danger: true }),
  ]));

  return [
    el('h3', { text: 'Components' }),
    part.hardware.length
      ? el('div', {}, rows)
      : muted('Magnets, threaded inserts, an NFC tag — added during the print. Skip this if the '
        + 'part is just plastic.'),
    button('Add a component', () => {
      const entry = { hardwareId: catalogue[0].id, qty: 1 };
      defaultFitFor(entry, config);
      part.hardware.push(entry);
      render();
    }, { key: `portal-hwadd-${part.id}` }),
  ];
}

/**
 * The customer's own post-processing choices - the same five the estimator
 * offers, in a collapsed section so a part that ships straight off the printer
 * needs none of it. The NFC coding option only appears once an NFC component is
 * on the part, and "Fit the …" only once an after-print component is added, so
 * the customer is never asked about finishing work that does not apply.
 */
function portalPostProcessing(part, config) {
  // The operations are the company's configured list (it travels in the pricing
  // slice); the pick-list (config.hardware) is trimmed to id/name, so the full
  // specs — the `nfc` flag and the during/after stage that gate the options —
  // come from config.pricing.hardware.
  const ops = config.pricing?.postProcessing?.ops || [];
  const catalogue = config.pricing?.hardware || [];
  const specOf = (e) => catalogue.find((h) => h.id === e.hardwareId);
  const matchesFor = (gate) => (part.hardware || [])
    .map((e, i) => ({ e, i, spec: specOf(e) }))
    .filter(({ e, spec }) => spec && num(e.qty, 1) > 0 && gateMatches(gate, spec));

  const setWholePart = (opId, on) => {
    const map = { ...(part.postProcessing || {}) };
    if (on) map[opId] = true; else delete map[opId];
    part.postProcessing = map;
    render();
  };
  const setComponent = (entry, opId, on) => {
    const map = { ...(entry.ops || {}) };
    if (on) map[opId] = true; else delete map[opId];
    entry.ops = map;
    delete entry.fit;
    render();
  };

  const body = [];
  for (const op of ops) {
    if (op.archived) continue;
    const gate = op.gate || { kind: 'always' };
    const matches = matchesFor(gate);

    if (op.perComponent) {
      for (const { e, i, spec } of matches) {
        const on = entryPostOps(e)[op.id] === true;
        body.push(checkField(`portal-pp-${op.id}-${part.id}-${i}`,
          `${op.name} the ${spec.name.toLowerCase()}`, on, (v) => setComponent(e, op.id, v), {
            hint: on
              ? 'Assembled onto the part before it ships — a finished product.'
              : 'Otherwise it ships loose in the box for you to fit yourself.',
          }));
      }
      continue;
    }

    if (gate.kind && gate.kind !== 'always' && matches.length === 0) continue;
    const on = (part.postProcessing || {})[op.id] === true;
    body.push(checkField(`portal-pp-${op.id}-${part.id}`, op.name, on,
      (v) => setWholePart(op.id, v), { hint: op.hint }));
    if (gate.kind === 'nfc' && on) {
      body.push(textField(`portal-nfc-url-${part.id}`, 'Link to code onto the tag', part.nfcUrl || '',
        (v) => { part.nfcUrl = v; render(); }, { placeholder: 'https://…' }));
    }
  }

  if (!body.length) {
    body.push(muted('Nothing to finish — this part ships straight off the printer.'));
  }

  return section(`portal-pp-${part.id}`, 'Add post-processing?  (support, resin, coding, fit…)',
    body, { open: false });
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

  // The bed picture: every part positioned together on the plate(s), so the
  // client sees how their parts share a bed — the same view the workshop sees.
  // A part's colours are the loaded spools its mix actually uses (percent > 0),
  // so a plate only shows a purge tower where its parts span more than one.
  const materialsOfPart = (p) => {
    const ids = normaliseMix(p.mix, slots).entries
      .filter((e) => e.percent > 0)
      .map((e) => slots.find((s) => s.id === e.slotId)?.materialId)
      .filter(Boolean);
    return [...new Set(ids)];
  };
  const bedItems = state.parts.map((p, i) => ({
    id: p.id || `p${i}`,
    label: p.name || `Part ${i + 1}`,
    size: p.orientedSize || p.geometry?.size
      || (p.manual ? { x: p.manual.x, y: p.manual.y, z: p.manual.z } : null),
    count: p.quantity,
    materials: materialsOfPart(p),
  })).filter((it) => it.size && it.size.x && it.size.y);
  const bedNode = bedPlan(bedItems, printer?.build, {
    tower: bedTowerFootprint(config, slots),
    printerName: printer?.name || '',
    selectedIndex: state.ui?.selectedBed || 0,
    onSelectBed: (i) => { state.ui = { ...(state.ui || {}), selectedBed: i }; render(); },
  });
  if (bedNode) {
    nodes.push(el('div', { class: 'panel' }, [el('h2', { text: 'On the bed' }), bedNode]));
  }

  // Only couriers that can actually carry the parcel (by size) are offered; the
  // full method specs with their size limits ride in the pricing slice.
  const parcelDims = result.packaging?.outerDims || null;
  const fullShipping = config.pricing?.shipping || [];
  const shipFits = (id) => {
    const m = fullShipping.find((s) => s.id === id);
    return !m || !parcelDims || packageFits(m, parcelDims, 0).fits;
  };
  // Which countries the customer may be in decides which couriers apply. Local
  // only: the company's own domestic methods, no international courier. With
  // international on: the domestic methods for a home-country client, and the
  // international courier once they are elsewhere. Collection is offered on its
  // own line below, so its method is not repeated here.
  const clientCountry = config.shipInternational
    ? (state.customer.countryId || config.countryId) : config.countryId;
  const clientIsHome = clientCountry === config.countryId;
  const countryOk = (m) => {
    if (m.id === 'collect') return false;
    if (m.country === config.countryId) return clientIsHome;
    if (m.country === '*') return !!config.shipInternational;
    return false;
  };
  const shipOptions = config.shipping.filter((m) => countryOk(m)
    && (shipFits(m.id) || m.id === state.shippingMethodId));

  nodes.push(el('div', { class: 'panel' }, [
    el('h2', { text: 'Delivery' }),
    selectField('portal-shipping', 'How should it reach you?',
      [{ value: 'auto', label: 'Cheapest that fits' },
        ...shipOptions.map((m) => ({ value: m.id, label: `${m.name} — about ${m.days} days` })),
        { value: 'collect', label: 'I’ll collect it myself (no delivery)' }],
      state.shippingMethodId, (v) => { state.shippingMethodId = v; render(); }),
    state.shippingMethodId === 'collect'
      ? muted('No delivery address needed — you will collect it from us.')
      : null,
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
      // The post-processing chosen, as an operation map; per-component choices
      // (fit) ride on the hardware entries below.
      postProcessing: p.postProcessing,
      nfcUrl: p.nfcUrl,
      mustFit: p.mustFit,
      // The components the customer asked for, each carrying its own per-op
      // choices (e.g. fitted rather than shipped loose).
      hardware: (p.hardware || []).map((h) => ({ ...h })),
      // This part's share of each loaded spool, keyed to the slots above.
      mix: p.mix,
      colours: Math.max(1, normaliseMix(p.mix, slots).entries.filter((e) => e.percent > 0).length),
    })),
    // The phone travels normalised to +<country><number> when it is valid, so
    // the workshop stores it in one consistent form.
    customer: {
      ...state.customer,
      phone: (() => {
        const v = validatePhone(state.customer.phone, state.customer.countryId || config.countryId);
        return v.ok ? v.value : state.customer.phone;
      })(),
    },
    order: {
      shippingMethodId: state.shippingMethodId,
      // A collection carries no delivery, so the workshop skips the courier.
      packagingCollected: state.shippingMethodId === 'collect',
    },
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

  // When the company only ships locally, the customer is in the company's own
  // country — the country is fixed, not chosen — and no international courier is
  // offered. With international shipping on, the client picks their country.
  const localOnly = !config.shipInternational;
  if (localOnly) state.customer.countryId = config.countryId;

  const valid = customerValidity(config);
  const phoneCountry = state.customer.countryId || config.countryId;
  const dial = dialInfoFor(phoneCountry);
  const countryOptions = (config.pricing?.countries || [])
    .map((c) => ({ value: c.id, label: c.name }));
  const companyCountryName = countryOptions.find((c) => c.value === config.countryId)?.label
    || config.countryId;

  const needed = [];
  if (valid.errors.firstName) needed.push('your first name');
  if (valid.errors.surname) needed.push('your surname');
  if (valid.errors.email) needed.push('a valid email');
  if (valid.errors.phone) needed.push('a valid phone number');
  if (valid.errors.address) needed.push('a delivery address (or choose to collect)');

  // The send buttons stay active and act as a sanity check: a valid form goes
  // through; an invalid one turns the offending fields red and jumps to the
  // first one, keeping everything the client has already typed.
  const sanityChecked = (action) => {
    if (valid.ok) { showConfirmSummary(action); return; }
    state.submitAttempted = true;
    render();
    focusFirstInvalid(valid);
    toast('Please check the highlighted fields');
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

    // Returning customers keep their details in a file and load it here.
    buttonRow([
      button('Load my saved details', loadClientDetails, { key: 'portal-load-client' }),
      button('Save my details', () => {
        download(new Blob([JSON.stringify({ kind: 'client', v: 1, customer: state.customer }, null, 2)],
          { type: 'application/json' }), 'my-details.json');
        toast('Saved — load this next time to fill your details in');
      }, { key: 'portal-save-client' }),
    ]),

    el('div', { class: 'field-grid' }, [
      validatedInput('portal-firstname', 'First name', state.customer.firstName,
        (v) => { state.customer.firstName = v; composeCustomerName(); render(); }, {
          required: true,
          valid: !!String(state.customer.firstName).trim(),
          error: state.submitAttempted && valid.errors.firstName ? valid.errors.firstName : null,
        }),
      validatedInput('portal-surname', 'Surname', state.customer.surname,
        (v) => { state.customer.surname = v; composeCustomerName(); render(); }, {
          required: true,
          valid: !!String(state.customer.surname).trim(),
          error: state.submitAttempted && valid.errors.surname ? valid.errors.surname : null,
        }),
    ]),
    el('div', { class: 'field-grid' }, [
      validatedInput('portal-email', 'Your email', state.customer.email,
        (v) => { state.customer.email = v; render(); }, {
          type: 'email', required: true, valid: valid.email.ok,
          error: (state.submitAttempted || state.customer.email) && !valid.email.ok ? valid.email.message : null,
        }),
    ]),
    el('div', { class: 'field-grid' }, [
      localOnly || !countryOptions.length
        // Local-only: the country is fixed, shown read-only rather than picked.
        ? el('div', { class: 'field' }, [
          el('label', { class: 'field__label', text: 'Country' }),
          el('div', { class: 'input', 'data-field': 'portal-country-fixed', text: companyCountryName }),
        ])
        : selectField('portal-country', 'Country', countryOptions, phoneCountry,
          (v) => {
            state.customer.countryId = v;
            // The address shows the country too, so keep it in step with the picker.
            state.customer.addressParts.country = countryOptions.find((c) => c.value === v)?.label || '';
            render();
          }),
      validatedInput('portal-phone', 'Phone', state.customer.phone,
        (v) => { state.customer.phone = formatPhone(v, phoneCountry); render(); },
        {
          type: 'tel', required: true, valid: valid.phone.ok,
          hint: dial.example ? `e.g. ${dial.example}` : null,
          error: (state.submitAttempted || state.customer.phone) && !valid.phone.ok ? valid.phone.message : null,
        }),
    ].filter(Boolean)),

    checkField('portal-business', 'This is a business (add a VAT number)',
      state.customer.isBusiness, (v) => {
        state.customer.isBusiness = v;
        // Ticking it defaults the address to a business address; they can still
        // change it back to a home or complex address.
        if (v && state.customer.addressParts.type !== 'business') {
          state.customer.addressParts.type = 'business';
        }
        render();
      }, { hint: 'Adds your VAT number to the invoice. The delivery address can still be a home address.' }),
    state.customer.isBusiness
      ? validatedInput('portal-vat', 'VAT number', state.customer.vatNumber,
        (v) => { state.customer.vatNumber = v; render(); })
      : null,

    el('h3', { text: valid.needsAddress ? 'Delivery address' : 'Address (optional)' }),
    addressBlock(),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: 'Anything we should know', for: 'p-notes' }),
      el('textarea', {
        class: 'input input--area', id: 'p-notes', 'data-field': 'portal-notes',
        on: { change: (e) => { state.customer.notes = e.target.value; } },
      }, state.customer.notes || ''),
    ]),
    config.newsletter
      ? checkField('portal-newsletter', 'Keep me posted about news and deals',
        state.customer.newsletter, (v) => { state.customer.newsletter = v; render(); }, {
          hint: 'Optional — tick to join our newsletter. We only add you if you ask us to.',
        })
      : null,

    state.submitAttempted && needed.length
      ? banner('danger', `Before you can send, we still need: ${needed.join('; ')}.`)
      : null,
    buttonRow([
      button('Copy a request link', () => sanityChecked(() => {
        const link = requestLink();
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(link)
            .then(() => toast('Link copied — send it to us, and attach your model file'))
            .catch(() => toast('Could not copy the link'));
        } else toast('Copying is not available here; use Download instead');
      }), { primary: true, key: 'portal-link' }),
      button('Download the request', () => sanityChecked(() => {
        download(new Blob([JSON.stringify(makePayload(), null, 2)], { type: 'application/json' }),
          'quote-request.json');
        toast('Saved — email this file to us with your models');
      }), { key: 'portal-download' }),
      config.company.email
        ? button('Open in your email', () => sanityChecked(() => {
          window.location.href = `mailto:${config.company.email}?subject=${encodeURIComponent('Quote request')}`
            + `&body=${encodeURIComponent(`${requestText(result)}\n\nRequest link (open to import):\n${requestLink()}`)}`;
        }), { key: 'portal-email-link' })
        : null,
    ]),
  ]));

  nodes.push(goodToKnow());
  nodes.push(privacyNotice(config));

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
    state.printerId = config.defaultPrinterId
      || config.printers[0]?.id || state.settings.printers[0].id;
    state.materialId = config.materials[0]?.id || state.settings.materials[0].id;
    state.slots = null;
    state.parts = [makePortalPart({ profileId: config.profiles[0]?.id || state.settings.profiles[0].id })];
    state.customer.countryId = config.countryId || null;
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
