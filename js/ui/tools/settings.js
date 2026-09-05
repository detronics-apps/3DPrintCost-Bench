/**
 * Settings: the company, the pricing model, the print profiles, the labour
 * operations and the estimator's own assumptions.
 *
 * Every default in this app is editable, and this is where. The layout follows
 * the specification's order so somebody reading it can find the setting it is
 * talking about.
 */

import { el, toast, download } from '../dom.js';
import {
  section, subsection, numberField, textField, selectField, checkField, sliderField,
  percentField, moneyField, chips, button, buttonRow, table, muted, statTile, pill,
  banner, costRow,
} from '../controls.js';
import { equationSummary } from '../explain.js';
import { copyText } from '../export.js';
import { portalLink } from '../portal-link.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import { findCountry, TAX_NOTES, electricityTariff } from '../../countries.js';
import {
  LABOUR_SCOPES, SCOPE_IDS, labourCost, groupLabour, resolveLabourRate,
} from '../../labour.js';
import {
  DEMAND_TARGETS, CHARGE_MODES, DEFAULT_ALLOCATIONS, LABOUR_PLACEMENTS, thirdsPrice,
} from '../../pricing.js';
import { INFILL_PATTERNS, FACTOR_LABELS, FACTOR_ORDER, PUBLISHED_FACTORS, factorsFor } from '../../profiles.js';
import { DEFAULT_ESTIMATE_ASSUMPTIONS } from '../../estimate.js';
import { applyCountry, applyPreset, defaultSettings } from '../../settings.js';
import { makeId } from '../../projects.js';
import {
  state, saveSoon, exportAll, restoreFromFile,
} from '../../state.js';
import {
  syncSupported, syncState, connectSync, disconnectSync, syncNeedsPermission,
} from '../sync.js';

export const id = 'settings';
export const name = 'Settings';
export const short = 'Setup';

const SECTIONS = [
  { id: 'company', name: 'Company' },
  { id: 'pricing', name: 'Pricing' },
  { id: 'profiles', name: 'Print profiles' },
  { id: 'labour', name: 'Labour' },
  { id: 'estimator', name: 'Estimator' },
  { id: 'backup', name: 'Backup & restore' },
  { id: 'sync', name: 'Team sync' },
  { id: 'equations', name: 'Equations' },
];

const touch = (rerender) => { saveSoon(); rerender(); };

/* -------------------------------------------------------------- company -- */

/**
 * Logo and colour for the printed documents.
 *
 * The logo is read into a data URI and kept in settings like everything else -
 * nothing is uploaded, and it travels with a saved file. A size guard keeps a
 * huge photo from bloating every export; a logo is a small image by nature.
 */
function companyBranding(settings, set) {
  const logo = settings.company.logo;
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/svg+xml,image/webp',
    class: 'visually-hidden',
    'data-field': 'company-logo-file',
    on: {
      change: (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 300 * 1024) {
          toast('That image is over 300 KB — please use a smaller logo');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => set('logo')(String(reader.result));
        reader.onerror = () => toast('Could not read that image');
        reader.readAsDataURL(file);
      },
    },
  });

  return subsection('Branding (quotes & invoices)', [
    muted('Put your own logo and colour on the printed documents. The logo is stored in your '
      + 'browser as data — nothing is uploaded, and it travels with a saved file.'),
    el('div', { class: 'brand-row' }, [
      logo
        ? el('img', { class: 'brand-preview', src: logo, alt: 'Company logo' })
        : el('div', { class: 'brand-preview brand-preview--empty' }, [muted('No logo')]),
      el('div', { class: 'brand-actions' }, [
        buttonRow([
          button(logo ? 'Replace logo' : 'Upload a logo', () => fileInput.click(), { key: 'logo-upload' }),
          logo ? button('Remove', () => set('logo')(null), { key: 'logo-remove', danger: true }) : null,
        ].filter(Boolean)),
        fileInput,
      ]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', text: 'Accent colour', for: 'company-accent' }),
      el('div', { class: 'brand-colour' }, [
        el('input', {
          type: 'color', id: 'company-accent', 'data-field': 'company-accent',
          value: settings.company.accentColour || '#1f6feb',
          on: { change: (e) => set('accentColour')(e.target.value) },
        }),
        muted('Tints the headings and the totals line on your quotes and invoices.'),
      ]),
    ]),
  ]);
}

function companyPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const country = findCountry(settings.countries, settings.countryId);
  const code = settings.currencyCode;
  const set = (key) => (value) => { settings.company[key] = value; touch(rerender); };

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Company' }),
      textField('company-name', 'Name', settings.company.name, set('name')),
      el('div', { class: 'field-grid' }, [
        textField('company-email', 'Email', settings.company.email, set('email')),
        textField('company-phone', 'Phone', settings.company.phone, set('phone')),
      ]),
      textField('company-address', 'Address', settings.company.address, set('address'), { multiline: true }),
      el('div', { class: 'field-grid' }, [
        textField('company-reg', 'Registration number', settings.company.registration, set('registration')),
        textField('company-vat', 'VAT number', settings.company.vatNumber, set('vatNumber')),
      ]),
      textField('company-terms', 'Terms printed on documents', settings.company.terms,
        set('terms'), { multiline: true, rows: 3 }),
      el('div', { class: 'field-grid' }, [
        numberField('quote-validity', 'Quote valid for', settings.company.quoteValidityDays,
          (v) => set('quoteValidityDays')(Math.max(1, Math.round(num(v, 30)))), { min: 1, step: 1, suffix: 'days' }),
        numberField('handling-days', 'Handling days before despatch', settings.company.handlingDays,
          (v) => set('handlingDays')(Math.max(0, Math.round(num(v, 1)))), { min: 0, step: 1, suffix: 'days' }),
      ]),
      companyBranding(settings, set),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Country, currency and tax' }),
      selectField('country', 'Country',
        settings.countries.map((c) => ({ value: c.id, label: c.name })),
        settings.countryId, (v) => {
          state.settings = applyCountry(settings, v);
          touch(rerender);
        }, {
          hint: 'Changing this switches the currency, the tax rate, the electricity '
            + 'tariff and the material prices to that country’s. It does not convert '
            + 'anything — there is no exchange rate in this app.',
        }),
      el('div', { class: 'summary-grid' }, [
        statTile('Currency', code),
        statTile('Labour default', `${fmtMoney(country.labourRate, code)}/h`),
        statTile('Electricity', `${fmtMoney(electricityTariff(country, settings.electricityAlternativeId), code)}/kWh`),
      ]),
      selectField('electricity-tariff', 'Electricity tariff',
        [{ value: '', label: country.electricity.label },
          ...(country.electricity.alternatives || []).map((a) => ({ value: a.id, label: `${a.label} — ${a.tariff}` }))],
        settings.electricityAlternativeId || '',
        (v) => { settings.electricityAlternativeId = v || null; touch(rerender); }),
      subsection('Tax', [
        // Framed as the business fact, not an accounting verb: you only charge
        // the tax once you are registered for it, and a small operation often
        // is not. Off means no tax line on any quote or invoice.
        checkField('tax-enabled', `Registered for ${settings.tax.name}`, settings.tax.enabled,
          (v) => { settings.tax.enabled = v; touch(rerender); }),
        settings.tax.enabled
          ? percentField('tax-rate', `${settings.tax.name} rate`, settings.tax.rate,
            (v) => { settings.tax.rate = v; touch(rerender); })
          : muted(`Not registered — no ${settings.tax.name} is added to quotes or invoices.`),
        settings.tax.enabled
          ? checkField('tax-inclusive', 'Prices already include tax', settings.tax.inclusive,
            (v) => { settings.tax.inclusive = v; touch(rerender); })
          : null,
      ], { hint: TAX_NOTES[settings.countryId] }),
      muted(`Country defaults were compiled for ${country.asOf}. Check them against your `
        + 'own bills — they move, and they differ by supplier.'),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Document numbering' }),
      el('div', { class: 'field-grid' }, [
        textField('quote-prefix', 'Quote prefix', settings.numbering.quotePrefix,
          (v) => { settings.numbering.quotePrefix = v; touch(rerender); }),
        textField('invoice-prefix', 'Invoice prefix', settings.numbering.invoicePrefix,
          (v) => { settings.numbering.invoicePrefix = v; touch(rerender); }),
      ]),
      el('div', { class: 'field-grid' }, [
        numberField('next-quote', 'Next quote number', settings.numbering.nextQuote,
          (v) => { settings.numbering.nextQuote = Math.max(1, Math.round(num(v, 1))); touch(rerender); },
          { min: 1, step: 1 }),
        numberField('next-invoice', 'Next invoice number', settings.numbering.nextInvoice,
          (v) => { settings.numbering.nextInvoice = Math.max(1, Math.round(num(v, 1))); touch(rerender); },
          { min: 1, step: 1 }),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Customer self-quoting' }),
      muted('A customer-facing form uses the same calculation engine as internal '
        + 'quoting, and shows only what you allow. It is configured here; nothing is '
        + 'published anywhere by this app, which has no server to publish to.'),
      checkField('portal-enabled', 'Offer a customer quoting form',
        settings.customerPortal.enabled, (v) => { settings.customerPortal.enabled = v; touch(rerender); }),
      checkField('portal-breakdown', 'Show customers the cost breakdown',
        settings.customerPortal.showBreakdown,
        (v) => { settings.customerPortal.showBreakdown = v; touch(rerender); }, {
          hint: 'Off by default. With this off a customer sees a price and a lead time '
            + 'and none of your costs.',
        }),
      moneyField('portal-minimum', 'Minimum order', settings.customerPortal.minimumOrder,
        (v) => { settings.customerPortal.minimumOrder = num(v); touch(rerender); }, code),
      percentField('portal-quote-buffer', 'Quote padding', num(settings.customerPortal.quoteBuffer, 0),
        (v) => { settings.customerPortal.quoteBuffer = Math.max(0, num(v)); touch(rerender); }, {
          info: 'Added on top of the customer’s estimate so the real invoice, priced from the '
            + 'sliced part, comes in at or under the quote. A pleasant surprise rather than an '
            + 'awkward one. Zero quotes the bare estimate.',
        }),
      selectField('portal-expedite', 'Expedite (pay the estimate to skip the quote)', [
        { value: 'off', label: 'Off — normal quote flow only' },
        { value: 'optional', label: 'Optional — the client may pay the estimate now' },
        { value: 'only', label: 'Expedite only — never issue a manual quote' },
      ], settings.customerPortal.expediteMode || 'off',
      (v) => { settings.customerPortal.expediteMode = v; touch(rerender); }, {
        hint: 'Lets a client who is happy with the padded estimate pay it up front (with proof of '
          + 'payment) and skip the quote — the order jumps straight to payment and into production. '
          + 'The padding is what keeps the estimate at or above the final cost.',
      }),
      subsection('Print intents customers may choose', settings.profiles.map((p) => checkField(
        `portal-profile-${p.id}`, p.name,
        settings.customerPortal.allowedProfiles.includes(p.id),
        (checked) => {
          settings.customerPortal.allowedProfiles = checked
            ? [...new Set([...settings.customerPortal.allowedProfiles, p.id])]
            : settings.customerPortal.allowedProfiles.filter((x) => x !== p.id);
          touch(rerender);
        },
      ))),
      subsection('The link to give customers', [
        buttonRow([
          button('Copy the customer form link', () => {
            copyText(portalLink(settings));
          }, { primary: true, key: 'copy-portal-link' }),
          el('a', {
            class: 'btn',
            href: 'quote.html',
            target: '_blank',
            rel: 'noopener',
            'data-field': 'open-portal',
            text: 'Open the form',
          }),
        ]),
        buttonRow([
          button('Copy an internal (cost-only) link', () => {
            copyText(portalLink(settings, { internal: true }));
          }, { key: 'copy-internal-link' }),
        ]),
        muted('The internal link is for staff: it prices at cost only — no labour, no profit — '
          + 'and skips the quote buffer and expedite. Use it to see what a print actually costs '
          + 'to make.'),
        banner('warn', 'The link carries your prices and your cost model in its URL '
          + 'fragment, because there is no server to hold them. The form never renders '
          + 'your costs — but somebody who reads the link itself could find them. Treat '
          + 'it as you would a price list you email out.'),
      ]),
    ]),
  ];
}

/* -------------------------------------------------------------- pricing -- */

function pricingPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const example = 100;
  // The example price is worked out through the real thirds config, so the growth
  // split is reflected honestly rather than a headline 3x that no longer holds.
  const examplePrice = thirdsPrice(example, settings.thirds, 1, 0).price;
  const multiple = examplePrice / example;

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Pricing preset' }),
      chips('preset', settings.presets.map((p) => ({ value: p.id, label: p.name, title: p.blurb })),
        settings.presetId, (v) => { state.settings = applyPreset(settings, v); touch(rerender); }),
      muted(settings.presets.find((p) => p.id === settings.presetId)?.blurb || ''),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Rule of thirds' }),
      muted('One third pays back the cost, one third covers labour and growth, one third '
        + 'is profit and capital — three times the Cost to Company at the ceiling. The '
        + 'growth share below hands part of that back to the customer, so a real quote '
        + 'usually lands under it.'),
      el('div', { class: 'field-grid' }, [
        numberField('thirds-commercial', 'Labour + growth share', settings.thirds.commercialShare,
          (v) => { settings.thirds.commercialShare = Math.max(0, num(v)); touch(rerender); },
          { min: 0, step: 0.05, suffix: '× CTC' }),
        numberField('thirds-profit', 'Profit + capital share', settings.thirds.profitShare,
          (v) => { settings.thirds.profitShare = Math.max(0, num(v)); touch(rerender); },
          { min: 0, step: 0.05, suffix: '× CTC' }),
      ]),
      percentField('growth-client-share', 'Growth passed to the customer',
        num(settings.thirds.growthClientShare, 0.5),
        (v) => { settings.thirds.growthClientShare = Math.min(1, Math.max(0, num(v))); touch(rerender); }, {
          info: 'The growth is the room left in the second tank once labour is paid for. This '
            + 'share of it is handed back to the customer as a saving instead of charged, so the '
            + 'quote lands under its ceiling. The profit third follows, because it is measured on '
            + 'what is kept. 0% keeps all of it — the classic three-times price.',
        }),
      moneyField('minimum-price', 'Minimum part price', settings.thirds.minimumPartPrice,
        (v) => { settings.thirds.minimumPartPrice = num(v); touch(rerender); }, code),
      el('div', { class: 'summary-grid' }, [
        statTile('A part costing ' + fmtMoney(example, code), fmtMoney(examplePrice, code),
          { hint: `sells for ${multiple.toFixed(2)}× its cost after the growth split`, tone: 'accent' }),
      ]),
      selectField('demand-target', 'Demand applies to',
        DEMAND_TARGETS.map((t) => ({ value: t.id, label: t.name })),
        settings.thirds.demandTarget,
        (v) => { settings.thirds.demandTarget = v; touch(rerender); }, {
          hint: DEMAND_TARGETS.find((t) => t.id === settings.thirds.demandTarget)?.hint,
        }),

      subsection('Where labour is recovered', [
        selectField('labour-in', 'Labour sits',
          LABOUR_PLACEMENTS.map((p) => ({ value: p.id, label: p.name })),
          settings.thirds.labourIn || 'labour-third',
          (v) => { settings.thirds.labourIn = v; touch(rerender); }, {
            hint: LABOUR_PLACEMENTS.find((p) => p.id === (settings.thirds.labourIn || 'labour-third'))?.hint,
          }),
        settings.thirds.labourIn === 'ctc' ? null : percentField(
          'labour-uplift', 'Growth charged on top of labour', settings.thirds.labourUplift || 0,
          (v) => { settings.thirds.labourUplift = v; touch(rerender); }, {
            info: 'Zero recovers the work at exactly what it cost. Anything above '
              + 'that is growth charged on the labour rather than on the plastic.',
          },
        ),
        muted(labourExample(settings, code)),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Cost to Company' }),
      percentField('ctc-allowance', 'General allowance', settings.ctc.generalAllowance,
        (v) => { settings.ctc.generalAllowance = v; touch(rerender); }, {
          info: 'The small direct costs nobody itemises. This is not shipping and it is '
            + 'not profit.',
        }),
      moneyField('other-direct', 'Other direct cost per part', settings.ctc.otherDirectPerPart,
        (v) => { settings.ctc.otherDirectPerPart = num(v); touch(rerender); }, code),
      subsection('Rejection and scrap', [
        selectField('scrap-mode', 'Based on', [
          { value: 'percent', label: 'A fixed allowance' },
          { value: 'printer', label: 'Each printer’s recorded failure rate' },
          { value: 'historical', label: 'Your own production history' },
        ], settings.scrap.mode, (v) => { settings.scrap.mode = v; touch(rerender); }),
        percentField('scrap-rate', 'Allowance', settings.scrap.rate,
          (v) => { settings.scrap.rate = v; touch(rerender); }),
        numberField('scrap-min', 'Prints needed before history is used', settings.scrap.minimumSamples,
          (v) => { settings.scrap.minimumSamples = Math.max(1, Math.round(num(v, 10))); touch(rerender); },
          { min: 1, step: 1 }),
        muted(`At ${fmtRate(settings.scrap.rate)} scrap you have to start `
          + `${(1 / Math.max(0.05, 1 - settings.scrap.rate)).toFixed(3)} parts to finish one — `
          + `${fmtRate(1 / Math.max(0.05, 1 - settings.scrap.rate) - 1)} more cost, not `
          + `${fmtRate(settings.scrap.rate)}.`),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Internal allocation' }),
      banner('info', 'These weights divide up the commercial thirds you have already '
        + 'charged. They are never added to a price — the shipped set adds to 152%, and '
        + 'adding it would be a markup nobody decided on.'),
      table([
        { label: 'Bucket', get: (b) => b.name },
        {
          label: 'Weight',
          align: 'right',
          get: (b) => numberField(`alloc-${b.id}`, '', Math.round(b.weight * 100),
            (v) => { b.weight = Math.max(0, num(v)) / 100; touch(rerender); },
            { min: 0, step: 1, suffix: '%' }),
        },
        {
          label: 'Share of the commercial thirds',
          align: 'right',
          mono: true,
          get: (b) => {
            const total = settings.allocations.reduce((t, x) => t + num(x.weight), 0) || 1;
            return fmtRate(num(b.weight) / total);
          },
        },
        {
          label: '',
          get: (b) => (b.duplicates ? pill(`also charged as ${b.duplicates}`, 'warn') : ''),
        },
      ], settings.allocations),
      buttonRow([button('Back to the shipped weights', () => {
        settings.allocations = DEFAULT_ALLOCATIONS.map((b) => ({ ...b }));
        touch(rerender);
      }, { key: 'reset-allocations' })]),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Order extras' }),
      subsection('Free shipping', [
        checkField('free-enabled', 'Offer free shipping', settings.freeShipping.enabled,
          (v) => { settings.freeShipping.enabled = v; touch(rerender); }),
        moneyField('free-threshold', 'Threshold on the part value', settings.freeShipping.threshold,
          (v) => { settings.freeShipping.threshold = num(v); touch(rerender); }, code),
        selectField('free-applies', 'Measured', [
          { value: 'after', label: 'After the customer discount' },
          { value: 'before', label: 'Before the customer discount' },
        ], settings.freeShipping.appliesTo, (v) => { settings.freeShipping.appliesTo = v; touch(rerender); }),
        selectField('free-basis', 'Basis', [
          { value: 'order', label: 'The whole order' },
          { value: 'part', label: 'A single line must clear it' },
        ], settings.freeShipping.basis, (v) => { settings.freeShipping.basis = v; touch(rerender); }),
        muted(`At the current thirds, ${fmtMoney(settings.freeShipping.threshold, code)} of parts `
          + `is a part costing ${fmtMoney(settings.freeShipping.threshold / Math.max(0.01, multiple), code)} to make.`),
      ]),
      subsection('Handling', [
        selectField('handling-mode', 'Handling', CHARGE_MODES.map((m) => ({ value: m.id, label: m.name })),
          settings.handling.mode, (v) => { settings.handling.mode = v; touch(rerender); }, {
            hint: CHARGE_MODES.find((m) => m.id === settings.handling.mode)?.hint,
          }),
        percentField('handling-rate', 'Handling rate', settings.handling.rate,
          (v) => { settings.handling.rate = v; touch(rerender); }),
      ]),
      subsection('Storage', [
        selectField('storage-mode', 'Storage', CHARGE_MODES.map((m) => ({ value: m.id, label: m.name })),
          settings.storage.mode, (v) => { settings.storage.mode = v; touch(rerender); }, {
            hint: CHARGE_MODES.find((m) => m.id === settings.storage.mode)?.hint,
          }),
        selectField('storage-method', 'Worked out by', [
          { value: 'percent', label: 'A percentage of the part value' },
          { value: 'volume', label: 'Volume and time stored' },
          { value: 'bin', label: 'Cost per bin' },
        ], settings.storage.method, (v) => { settings.storage.method = v; touch(rerender); }),
        settings.storage.method === 'percent'
          ? percentField('storage-rate', 'Storage rate', settings.storage.rate,
            (v) => { settings.storage.rate = v; touch(rerender); })
          : null,
        settings.storage.method === 'volume'
          ? el('div', { class: 'field-grid' }, [
            moneyField('storage-litre', 'Per litre per month', settings.storage.perLitrePerMonth,
              (v) => { settings.storage.perLitrePerMonth = num(v); touch(rerender); }, code),
            numberField('storage-months', 'Months stored', settings.storage.months,
              (v) => { settings.storage.months = Math.max(0, num(v)); touch(rerender); }, { min: 0 }),
          ])
          : null,
        settings.storage.method === 'bin'
          ? el('div', { class: 'field-grid' }, [
            moneyField('storage-bin', 'Per bin', settings.storage.perBin,
              (v) => { settings.storage.perBin = num(v); touch(rerender); }, code),
            numberField('storage-per-bin', 'Parts per bin', settings.storage.unitsPerBin,
              (v) => { settings.storage.unitsPerBin = Math.max(1, Math.round(num(v, 10))); touch(rerender); },
              { min: 1, step: 1 }),
          ])
          : null,
      ]),
      subsection('Quantity tiers', [
        table([
          {
            label: 'From quantity',
            align: 'right',
            get: (t) => numberField(`tier-qty-${t.qty}`, '', t.qty,
              (v) => { t.qty = Math.max(1, Math.round(num(v, 1))); touch(rerender); }, { min: 1, step: 1 }),
          },
          {
            label: 'Discount',
            align: 'right',
            get: (t) => numberField(`tier-disc-${t.qty}`, '', Math.round(t.discount * 100),
              (v) => { t.discount = Math.min(0.95, Math.max(0, num(v) / 100)); touch(rerender); },
              { min: 0, max: 95, step: 1, suffix: '%' }),
          },
        ], settings.volumeTiers, { compact: true }),
        muted('A batch is already cheaper per part before any of this is applied, because '
          + 'setup and administration are spread across it. These tiers are a commercial '
          + 'decision on top of that.'),
      ]),
    ]),
  ];
}


/**
 * The two readings, worked through, side by side.
 *
 * A setting whose consequence is "the part is now a third of the price" needs to
 * show that consequence where it is changed, not three screens away.
 */
function labourExample(settings, code) {
  const physical = 20;
  const labour = 125;
  const shares = 1 + num(settings.thirds.commercialShare) + num(settings.thirds.profitShare);
  const uplift = 1 + Math.max(0, num(settings.thirds.labourUplift, 0));

  const outside = physical * shares + labour * uplift;
  const inside = (physical + labour) * shares;

  return `A part with ${fmtMoney(physical, code)} of plastic and ${fmtMoney(labour, code)} of work: `
    + `${fmtMoney(outside, code)} with labour recovered once, `
    + `${fmtMoney(inside, code)} with it inside the Cost to Company.`;
}

/* ------------------------------------------------------------- profiles -- */

function profilesPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const selected = settings.profiles.find((p) => p.id === state.ui.selectedProfile)
    || settings.profiles[0];
  const factors = factorsFor(selected.settings, settings.factorModel);
  const published = PUBLISHED_FACTORS;

  const set = (key) => (value) => {
    selected.settings = { ...selected.settings, [key]: value };
    selected.version = num(selected.version, 1) + 1;
    touch(rerender);
  };

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Print intent profiles' }),
      chips('profile-pick', settings.profiles.map((p) => ({ value: p.id, label: p.name })),
        selected.id, (v) => { state.ui.selectedProfile = v; touch(rerender); }),
      muted(selected.blurb),
      el('div', { class: 'field-grid' }, [
        sliderField('p-infill', FACTOR_LABELS.infill, selected.settings.infill, set('infill'),
          { min: 0, max: 100, step: 1, format: (v) => `${v}%` }),
        sliderField('p-walls', FACTOR_LABELS.wallLoops, selected.settings.wallLoops, set('wallLoops'),
          { min: 1, max: 12, step: 1, format: (v) => String(v) }),
      ]),
      selectField('p-pattern', FACTOR_LABELS.infillPattern,
        INFILL_PATTERNS.map((p) => ({ value: p.id, label: p.name })),
        selected.settings.infillPattern, set('infillPattern')),
      selectField('p-material', FACTOR_LABELS.materialType,
        ['PLA', 'PLA-CF', 'PETG', 'ABS', 'ASA', 'TPU', 'PA-CF', 'PC'].map((t) => ({ value: t, label: t })),
        selected.settings.materialType, set('materialType')),
      selectField('p-layer', FACTOR_LABELS.layerHeight,
        [0.08, 0.1, 0.12, 0.15, 0.16, 0.2, 0.24, 0.28, 0.3].map((h) => ({ value: String(h), label: `${h} mm` })),
        String(selected.settings.layerHeight), (v) => set('layerHeight')(Number(v))),
      checkField('p-shrinkage', FACTOR_LABELS.shrinkage, selected.settings.shrinkage, set('shrinkage')),
      checkField('p-angle', FACTOR_LABELS.angleOptimisation, selected.settings.angleOptimisation, set('angleOptimisation')),
      checkField('p-ironing', FACTOR_LABELS.ironing, selected.settings.ironing, set('ironing')),
      checkField('p-fuzzy', FACTOR_LABELS.fuzzySkin, selected.settings.fuzzySkin, set('fuzzySkin')),
      muted(`Version ${selected.version}. Quotes record the version they were priced with, `
        + 'so editing a profile never changes a quote that has already gone out.'),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Factors for this profile' }),
      banner('info', 'These are your measurements, expressed against Display Only. The '
        + 'app reproduces them from an editable model, so changing a setting moves the '
        + 'factor instead of leaving it frozen.'),
      table([
        { label: 'Factor', get: (r) => r.label },
        { label: 'Time', align: 'right', mono: true, get: (r) => `${r.time.toFixed(3)}×` },
        { label: 'Material', align: 'right', mono: true, get: (r) => `${r.material.toFixed(3)}×` },
        {
          label: 'Published',
          align: 'right',
          mono: true,
          get: (r) => {
            const t = published.time[selected.id]?.[r.name];
            return t == null ? '—' : `${t.toFixed(2)}×`;
          },
        },
        {
          label: '',
          get: (r) => (r.basis === 'calibrated' ? pill('measured', 'ok')
            : (r.basis === 'extrapolated' ? pill('extrapolated', 'warn') : pill('assumed', 'info'))),
        },
      ], factors.parts, { compact: true }),
      el('div', { class: 'summary-grid' }, [
        statTile('Time factor', `${factors.time.toFixed(2)}×`,
          { hint: published.time[selected.id] ? `published ${published.time[selected.id].total}×` : null }),
        statTile('Material factor', `${factors.material.toFixed(2)}×`,
          { hint: published.material[selected.id] ? `published ${published.material[selected.id].total}×` : null }),
      ]),
      banner('warn', 'The published material factors multiply the wall effect by the '
        + 'infill effect, and both fill the same interior. On a real part their product '
        + 'exceeds solid, so the app holds the estimate at the part’s own solid volume '
        + 'and quotes from the geometry instead. Record real prints and it will learn a '
        + 'correction from your own machines.'),
    ]),
  ];
}

/* --------------------------------------------------------------- labour -- */

function labourPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const country = findCountry(settings.countries, settings.countryId);
  const labour = settings.labour;
  if (!labour.salary || typeof labour.salary !== 'object') {
    labour.salary = { monthly: 0, hoursPerMonth: 160, billablePercent: 0.7 };
  }
  const salaryMode = labour.rateMode === 'salary';
  const rate = resolveLabourRate(labour, country.labourRate);

  const example = labourCost(settings.labour.ops, { quantity: 1, jobs: 1, colourChanges: 0, hardwareInserts: 0 }, { rate });
  const batch = labourCost(settings.labour.ops, { quantity: 20, jobs: 2, colourChanges: 0, hardwareInserts: 0 }, { rate });

  // The salary-based rate, shown so the person can see what their inputs produce.
  const s = labour.salary;
  const chargeableHours = Math.max(0, num(s.hoursPerMonth)) * Math.max(0, Math.min(1, num(s.billablePercent)));

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Labour rate' }),
      selectField('labour-rate-mode', 'How the rate is set', [
        { value: 'direct', label: 'Enter a rate per hour' },
        { value: 'salary', label: 'Work it out from a salary' },
      ], salaryMode ? 'salary' : 'direct', (v) => {
        labour.rateMode = v === 'salary' ? 'salary' : 'direct';
        touch(rerender);
      }, {
        info: 'A rate per hour is the direct way. From a salary works the same rate '
          + 'out of what the person costs each month and how much of their time is '
          + 'actually billable.',
      }),

      salaryMode
        ? el('div', {}, [
          el('div', { class: 'field-grid' }, [
            moneyField('labour-salary', 'Monthly cost of the person', s.monthly,
              (v) => { s.monthly = Math.max(0, num(v)); touch(rerender); }, code, {
                hint: 'Their full monthly cost to the company — salary plus any on-costs '
                  + 'you carry, not just take-home pay.',
              }),
            numberField('labour-salary-hours', 'Paid hours a month', s.hoursPerMonth,
              (v) => { s.hoursPerMonth = Math.max(0, num(v)); touch(rerender); },
              { min: 0, step: 1, suffix: 'h', hint: 'About 160 for a 40-hour week.' }),
            percentField('labour-billable', 'Billable share of those hours', s.billablePercent,
              (v) => { s.billablePercent = Math.max(0, Math.min(1, num(v))); touch(rerender); }, {
                hint: 'How much of the paid month is charged to jobs. The rest — quoting, '
                  + 'maintenance, waiting on a machine — is real cost, so the rate carries it.',
              }),
          ]),
          el('div', { class: 'summary-grid' }, [
            statTile('Billable hours a month', chargeableHours ? `${Math.round(chargeableHours)} h` : '—',
              { hint: `of ${Math.round(num(s.hoursPerMonth))} paid` }),
            statTile('Works out to', chargeableHours && num(s.monthly) > 0 ? `${fmtMoney(rate, code)}/h` : '—',
              { hint: 'the rate every job is priced at', tone: 'accent' }),
          ]),
          muted(chargeableHours && num(s.monthly) > 0
            ? `${fmtMoney(num(s.monthly), code)} a month over ${Math.round(chargeableHours)} billable `
              + `hours is ${fmtMoney(rate, code)} an hour. Lower the billable share and the rate rises, `
              + 'because the same salary is recovered over fewer charged hours.'
            : `Fill in a monthly cost and a billable share above and the rate follows. Until then, `
              + `jobs use the ${country.name} default of ${fmtMoney(country.labourRate, code)}/h.`),
        ])
        : moneyField('labour-rate', 'Rate per hour', settings.labour.rate,
          (v) => { settings.labour.rate = num(v); touch(rerender); }, code, {
            hint: `Zero uses the ${country.name} default of ${fmtMoney(country.labourRate, code)}/h. `
              + country.labourRateNote,
          }),
      el('div', { class: 'summary-grid' }, [
        statTile('One part', `${Math.round(example.minutesPerUnit)} min`, { hint: fmtMoney(example.costPerUnit, code) }),
        statTile('Twenty on two plates', `${Math.round(batch.minutesPerUnit)} min each`,
          { hint: fmtMoney(batch.costPerUnit, code), tone: 'ok' }),
      ]),
      muted('That difference is the whole of quantity pricing before any discount: order '
        + 'and job time spread across the batch.'),
    ]),

    el('div', { class: 'panel' }, [
      el('div', { class: 'panel__head' }, [
        el('h3', { text: 'Operations' }),
        button('Add an operation', () => {
          settings.labour.ops.push({
            id: makeId('op'), name: 'New operation', minutes: 5, per: 'order',
            group: 'Other', complexity: 1, enabled: true, builtIn: false,
          });
          touch(rerender);
        }, { key: 'add-op' }),
      ]),
      ...groupLabour(settings.labour.ops.map((op) => ({ ...op, cost: 0, minutes: 0 })))
        .map(() => null).filter(Boolean),
      table([
        {
          label: 'On',
          get: (op) => checkField(`op-on-${op.id}`, '', op.enabled !== false,
            (v) => { op.enabled = v; touch(rerender); }),
        },
        {
          label: 'Operation',
          get: (op) => textField(`op-name-${op.id}`, '', op.name,
            (v) => { op.name = v; touch(rerender); }),
        },
        { label: 'Group', get: (op) => op.group || 'Other' },
        {
          label: 'Minutes',
          align: 'right',
          get: (op) => numberField(`op-min-${op.id}`, '', op.minutes,
            (v) => { op.minutes = Math.max(0, num(v)); touch(rerender); }, { min: 0, step: 0.5 }),
        },
        {
          label: 'Happens',
          get: (op) => selectField(`op-per-${op.id}`, '',
            LABOUR_SCOPES.map((s) => ({ value: s.id, label: s.name })),
            SCOPE_IDS.includes(op.per) ? op.per : 'order',
            (v) => { op.per = v; touch(rerender); }),
        },
        {
          label: 'Complexity',
          align: 'right',
          get: (op) => numberField(`op-cx-${op.id}`, '', op.complexity,
            (v) => { op.complexity = Math.max(0, num(v, 1)); touch(rerender); }, { min: 0, step: 0.1 }),
        },
        {
          label: '',
          get: (op) => button('Remove', () => {
            if (!window.confirm(`Remove the “${op.name}” operation for good? `
              + '(Untick “On” instead if you only want to switch it off.)')) return;
            settings.labour.ops = settings.labour.ops.filter((x) => x.id !== op.id);
            // Tombstone it so a shipped default is not topped back up on reload.
            const removed = settings.removed || (settings.removed = {});
            removed.labourOps = [...new Set([...(removed.labourOps || []), op.id])];
            touch(rerender);
          }, { key: `op-remove-${op.id}`, danger: true }),
        },
      ], settings.labour.ops, { compact: true }),
      muted('“Happens” is what makes quantity pricing honest. Per-order work is done once '
        + 'however many parts there are; per-part work is done for every one.'),
    ]),

    postProcessingPanel(ctx),
  ];
}

/**
 * The rates behind the post-processing steps a part can be marked for on the
 * estimate: a resin coat priced by top area, and coding an embedded NFC tag.
 */
function postProcessingPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const pp = settings.postProcessing;
  const setResin = (key) => (v) => { pp.resin[key] = Math.max(0, num(v)); touch(rerender); };

  return el('div', { class: 'panel' }, [
    el('h3', { text: 'Post-processing' }),
    muted('These are charged on the parts that survive the print, so they are never multiplied '
      + 'by the scrap rate. Tick a part for resin on the estimate; NFC coding is added on its own '
      + 'whenever a part has an NFC tag.'),
    subsection('Resin coat (by top area)', [
      muted('Set the rate for one square centimetre of top surface and it is interpolated to the '
        + 'part’s real top area. The top area is taken from the part’s footprint.'),
      el('div', { class: 'field-grid' }, [
        numberField('resin-min-cm2', 'Time per cm²', pp.resin.minutesPerCm2, setResin('minutesPerCm2'),
          { min: 0, step: 0.05, suffix: 'min/cm²' }),
        moneyField('resin-cost-cm2', 'Resin cost per cm²', pp.resin.costPerCm2,
          (v) => setResin('costPerCm2')(v), code, { hint: 'The resin consumed per cm² of coverage.' }),
      ]),
      numberField('resin-cure', 'Curing time', pp.resin.curingMinutes, setResin('curingMinutes'),
        { min: 0, step: 1, suffix: 'min', hint: 'Unattended — it adds finishing time, not labour.' }),
      numberField('resin-grams-cm2', 'Resin used per cm²', num(pp.resin.gramsPerCm2, 2),
        setResin('gramsPerCm2'), {
          min: 0, step: 0.1, suffix: 'g/cm²',
          hint: 'How much resin a cm² of coverage actually uses, in grams — used to book it '
            + 'out of Inventory and warn when a bottle runs low.',
        }),
    ]),
    subsection('NFC coding', [
      numberField('nfc-code-min', 'Coding time per tag', pp.nfc.codingMinutes,
        (v) => { pp.nfc.codingMinutes = Math.max(0, num(v)); touch(rerender); },
        { min: 0, step: 0.5, suffix: 'min', hint: 'Applied for every embedded NFC tag. Mark a '
          + 'component as an NFC tag in Catalogues → Hardware.' }),
    ]),
    subsection('Manual colour swaps', [
      muted('When a part uses more colours than the machine’s heads, the extra ones are reached '
        + 'by pausing at a height and swapping a spool by hand. Each swap is this much labour plus '
        + 'a stretch of the machine sitting paused — and any swap makes the plate attended-only, so '
        + 'it never runs overnight.'),
      el('div', { class: 'field-grid' }, [
        numberField('swap-labour', 'Labour per swap', settings.colour.swapLabourMinutes,
          (v) => { settings.colour.swapLabourMinutes = Math.max(0, num(v)); touch(rerender); },
          { min: 0, step: 0.5, suffix: 'min' }),
        numberField('swap-wait', 'Machine wait per swap', settings.colour.swapWaitMinutes,
          (v) => { settings.colour.swapWaitMinutes = Math.max(0, num(v)); touch(rerender); },
          { min: 0, step: 1, suffix: 'min', hint: 'How long the print sits paused until someone '
            + 'gets to it. This extends the job on the schedule.' }),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------ estimator -- */

function estimatorPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const a = settings.estimate.assumptions;
  const set = (key) => (value) => { a[key] = num(value); touch(rerender); };

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Estimator assumptions' }),
      muted('These turn geometry into grams and minutes. They are assumptions, and the '
        + 'app says so wherever an estimate is shown.'),
      el('div', { class: 'field-grid' }, [
        numberField('nozzle', 'Nozzle', a.nozzle, set('nozzle'), { min: 0.1, step: 0.05, suffix: 'mm' }),
        numberField('line-ratio', 'Line width as a ratio of the nozzle', a.lineWidthRatio,
          set('lineWidthRatio'), { min: 0.5, step: 0.05, suffix: '×' }),
      ]),
      numberField('skin-layers', 'Solid top and bottom layers', a.skinLayers, set('skinLayers'),
        { min: 0, step: 1 }),
      sliderField('flow-efficiency', 'Sustained share of the rated flow', a.flowEfficiency,
        set('flowEfficiency'), {
          min: 0.1, max: 1, step: 0.05, format: (v) => fmtRate(v),
          info: 'Nothing holds its rated flow all job: perimeters run slower than infill, '
            + 'corners decelerate, and small layers wait for cooling.',
        }),
      numberField('layer-overhead', 'Fixed cost of a layer', a.layerOverheadSeconds,
        set('layerOverheadSeconds'), { min: 0, step: 0.1, suffix: 's' }),
      numberField('travel-per-object', 'Travel between objects on a plate',
        num(a.travelSecondsPerObjectLayer, 0.8), set('travelSecondsPerObjectLayer'), {
          min: 0, step: 0.1, suffix: 's / object / layer',
          info: 'On a plate of several parts the toolhead hops between them on every layer. '
            + 'This is that travel, per extra object per layer — so a plate of many small parts '
            + 'is not under-estimated. Zero counts none.',
        }),
      numberField('support-scale', 'Support material scale', a.supportScale, set('supportScale'),
        { min: 0, step: 0.05, suffix: '×',
          hint: 'The app assumes every overhang is held from the build plate, which '
            + 'over-states supports above solid geometry. Scale it down if that matches '
            + 'what your slicer does.' }),
      subsection('Colour changes', [
        muted('A machine with one hotend has to purge the last colour out on every '
          + 'layer that changes, so its waste grows with height. A toolchanger keeps '
          + 'each head loaded and primes once at the start, so its waste does not. '
          + 'These two numbers are what separates them.'),
        numberField('purge-mm3', 'Flush volume per change, one hotend', a.purgePerChangeMm3,
          set('purgePerChangeMm3'), {
            min: 0, step: 50, suffix: 'mm³',
            info: 'Multi-colour and pause-and-change machines, on every layer that '
              + 'contains a transition. Your slicer calls this the flush or purge '
              + 'volume and knows yours exactly. 800 mm³ is about 1 g of PLA.',
          }),
        numberField('prime-mm3', 'Prime per head, toolchanger', a.primePerSpoolMm3,
          set('primePerSpoolMm3'), {
            min: 0, step: 100, suffix: 'mm³',
            info: 'Multi-material machines. Once per head, at the start.',
          }),
        sliderField('colour-interleave', 'Layers containing a colour change',
          a.colourInterleave, set('colourInterleave'), {
            min: 0, max: 1, step: 0.05, format: (v) => fmtRate(v),
            info: 'An assumption: only the slicer really knows. Paste the slicer’s own '
              + 'figures into a part and none of this is used.',
          }),
        numberField('prime-job-g', 'Priming per job', a.primeG, set('primeG'),
          { min: 0, step: 0.1, suffix: 'g' }),
      ]),

      subsection('Purge tower', [
        muted('A machine that changes filament on its own has to put the purged '
          + 'material somewhere: a tower printed beside the part, as tall as it is. '
          + 'It takes bed space, so fewer parts fit on a plate, so a batch needs more '
          + 'plates — and every plate after the first is somebody coming back to the '
          + 'machine. A pause-and-change machine has no tower; the person purges into '
          + 'a bin.'),
        el('div', { class: 'field-grid' }, [
          numberField('tower-x', 'Tower length', a.purgeTower?.x ?? 30,
            (v) => { a.purgeTower = { ...(a.purgeTower || {}), x: Math.max(0, num(v)) }; touch(rerender); },
            { min: 0, step: 1, suffix: 'mm' }),
          numberField('tower-y', 'Tower width', a.purgeTower?.y ?? 30,
            (v) => { a.purgeTower = { ...(a.purgeTower || {}), y: Math.max(0, num(v)) }; touch(rerender); },
            { min: 0, step: 1, suffix: 'mm' }),
        ]),
      ]),
      numberField('idle-minutes', 'Idle minutes charged per job', settings.estimate.idleMinutesPerJob,
        (v) => { settings.estimate.idleMinutesPerJob = Math.max(0, num(v)); touch(rerender); },
        { min: 0, step: 1, suffix: 'min' }),
      buttonRow([button('Back to the shipped assumptions', () => {
        settings.estimate.assumptions = { ...DEFAULT_ESTIMATE_ASSUMPTIONS };
        touch(rerender);
      }, { key: 'reset-assumptions' })]),
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: 'Start again' }),
      muted('This resets every setting on this page to the shipped defaults. Projects, '
        + 'customers and stock are left alone.'),
      buttonRow([button('Reset all settings', () => {
        if (!window.confirm('Reset every setting to the shipped defaults?')) return;
        const fresh = defaultSettings();
        state.settings = fresh;
        toast('Settings reset');
        touch(rerender);
      }, { danger: true, key: 'reset-settings' })]),
    ]),
  ];
}

/* ----------------------------------------------------------------- tool -- */

/* ------------------------------------------------------ backup & restore -- */

/**
 * Backup and restore: the answer to "how do I move to the latest version of the
 * app without losing my work". Save all writes one complete file; Restore reads
 * one back, through the migrations, so an older backup lands cleanly on a newer
 * build.
 */
function backupPanel(ctx) {
  const { rerender } = ctx;

  const fileInput = el('input', {
    type: 'file', accept: '.json', class: 'visually-hidden', 'data-field': 'restore-file',
    on: {
      change: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        const hasData = state.projects.length > 0 || state.customers.length > 0;
        if (hasData && !window.confirm('This replaces everything on this device — your current '
          + 'projects, customers and setup — with what is in the file. Save a backup first if you '
          + 'are unsure. Continue?')) return;

        const report = restoreFromFile(await file.text());
        if (!report.ok) { toast(report.error); return; }
        toast(`Restored ${report.projects} project${report.projects === 1 ? '' : 's'}`
          + `${report.invoices ? `, ${report.invoices} invoice${report.invoices === 1 ? '' : 's'}` : ''}`
          + ' and your full setup');
        rerender();
      },
    },
  });

  return [
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Backup & restore' }),
      muted('Everything you set up lives in this browser. As long as you keep opening the app '
        + 'from the same address, your data stays put across new versions — the app upgrades your '
        + 'saved data to each new release as it loads it. A backup file is your safety net for a '
        + 'cleared browser, a new computer, or a move to a new address.'),

      subsection('Save a backup', [
        muted('One file with everything: your whole setup — printers, materials, hardware, labour '
          + 'and calibration — and every project with its quotes and invoices, customers and '
          + 'inventory. (This is the same as “Save all” in the top bar.)'),
        buttonRow([
          button('Save a backup file now', () => {
            download(new Blob([exportAll()], { type: 'application/json' }),
              `3d-printing-bench-${new Date().toISOString().slice(0, 10)}.json`);
            state.ui.lastBackupAt = Date.now();
            saveSoon();
            toast('Saved to your downloads');
            rerender();
          }, { primary: true, key: 'backup-save' }),
        ]),
        state.ui.lastBackupAt
          ? muted(`Last backup: ${new Date(state.ui.lastBackupAt).toLocaleString()}.`)
          : banner('warn', 'You have not saved a backup yet.'),
      ]),

      subsection('Restore from a backup', [
        muted('Bring a whole workshop back from a backup file — into this version of the app. '
          + 'Use this after moving to a new computer or address, or to recover from a cleared '
          + 'browser. It replaces what is here now, so save a backup first if this device already '
          + 'holds work you want to keep.'),
        buttonRow([
          button('Restore everything from a file…', () => fileInput.click(), { key: 'backup-restore' }),
        ]),
        fileInput,
      ]),

      banner('info', 'Want it automatic? Team sync (next tab) keeps a live copy of everything in a '
        + 'Google Drive or OneDrive file as you work — a backup that is always current, and that any '
        + 'future version of the app can open.'),
    ]),
  ];
}

/**
 * Team sync: connect the workshop to a shared file. Management only - the
 * app-wide banner (main.js) is where a conflict or a permission re-grant is
 * actually resolved, so it is visible from any tool, not just this screen.
 */
function syncPanel(ctx) {
  const { rerender } = ctx;
  const s = syncState();

  if (!s.supported) {
    return [el('div', { class: 'panel' }, [
      el('h3', { text: 'Team sync (shared file)' }),
      banner('warn', 'Team sync needs Chrome or Edge on a computer — phones and Safari cannot '
        + 'connect to a file. You can still use Save all / Open to swap a file by hand.'),
      muted('The idea: keep one workshop.json in a Google Drive or OneDrive folder that syncs '
        + 'to your computer, connect it here, and a colleague connects the same file. Nothing '
        + 'goes through a server — the drive carries the file between you.'),
    ])];
  }

  const body = [
    muted('Keep a workshop.json in a Google Drive or OneDrive folder that syncs to this '
      + 'computer, connect it, and your colleague connects the same file. Changes save to it '
      + 'automatically and travel through the drive. Best with one person editing at a time — '
      + 'if you both change the same thing at once, you’ll be asked which version to keep.'),
  ];

  if (!s.connected) {
    body.push(buttonRow([
      button('Create a new shared file', async () => {
        try { await connectSync({ create: true }); toast('Connected'); } catch (e) {
          if (e.name !== 'AbortError') toast(e.message || 'Could not connect');
        }
        rerender();
      }, { primary: true, key: 'sync-new' }),
      button('Open an existing file', async () => {
        try {
          const r = await connectSync({ create: false });
          toast(r.hasContent ? 'Connected — choose whose data to keep, above' : 'Connected');
        } catch (e) {
          if (e.name !== 'AbortError') toast(e.message || 'Could not connect');
        }
        rerender();
      }, { key: 'sync-open' }),
    ]));
  } else {
    body.push(el('dl', { class: 'facts' }, [
      el('dt', { text: 'Shared file' }),
      el('dd', { class: 'value', text: s.name || '—' }),
      el('dt', { text: 'Last saved to it' }),
      el('dd', { class: 'value', text: s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleTimeString() : '—' }),
    ]));
    if (syncNeedsPermission()) {
      body.push(banner('warn', 'The browser needs your permission again after a restart — '
        + 'use the Reconnect button in the banner at the top.'));
    } else if (s.conflict) {
      body.push(banner('warn', 'A change is waiting to be resolved — see the banner at the top '
        + 'of the screen to choose which version to keep.'));
    } else {
      body.push(muted('Synced. It saves here automatically and checks for a colleague’s changes '
        + 'when you come back to the tab.'));
    }
    if (s.error) body.push(banner('danger', `Sync problem: ${s.error}`));
    body.push(buttonRow([
      button('Disconnect', async () => { await disconnectSync(); toast('Disconnected'); rerender(); },
        { key: 'sync-disconnect' }),
    ]));
  }

  return [el('div', { class: 'panel' }, [el('h3', { text: 'Team sync (shared file)' }), ...body])];
}

export function main(ctx) {
  const { rerender } = ctx;
  const which = state.ui.settingsSection || 'company';

  const panels = {
    company: companyPanel,
    pricing: pricingPanel,
    profiles: profilesPanel,
    labour: labourPanel,
    estimator: estimatorPanel,
    backup: backupPanel,
    sync: syncPanel,
    equations: () => [el('div', { class: 'panel' }, [
      el('h3', { text: 'Every equation this app uses' }),
      equationSummary(),
    ])],
  };

  return [
    chips('settings-section', SECTIONS.map((s) => ({ value: s.id, label: s.name })),
      which, (v) => { state.ui.settingsSection = v; touch(rerender); }),
    ...(panels[which] || panels.company)(ctx),
  ];
}
