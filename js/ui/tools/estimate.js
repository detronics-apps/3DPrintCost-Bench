/**
 * The estimator: models in, a price out.
 *
 * The bed holds several parts. One printer, one set of loaded filament -
 * `quick.printerId` / `quick.slots` - shared by every model on `quick.parts`,
 * because the printer and what is loaded in it belong to the bed, not to any
 * one part: load it once, print everything due together.
 *
 * Simple mode shows only the decisions somebody has to make. Advanced adds
 * every cost and where it came from. Expert adds the assumptions themselves.
 * The three numbers at the top - Cost to Company, Part price, Final invoice -
 * are always visible, because keeping those three apart is the point of the
 * whole app.
 */

import { el, toast } from '../dom.js';
import {
  section, subsection, numberField, textField, selectField, checkField, sliderField,
  percentField, moneyField, chips, button, buttonRow, banner, statTile, table,
  costRow, muted, emptyState, pill,
} from '../controls.js';
import { moneyDiagram, thirdsDiagram } from '../svg/money.js';
import { plateInBuildVolume, orientationChart } from '../svg/part.js';
import { savingsChart } from '../svg/savings.js';
import { plateSaving } from '../../savings.js';
import { splitByColour } from '../../colourplates.js';
import { partColourPlan, swapCost } from '../../colourplan.js';
import { slotLimit } from '../../printers.js';
import { explainLine, explainOrder } from '../explain.js';
import {
  downloadSvg, downloadPng, downloadCsv, orderCsv, copyText,
  buildLabourSheet, printSheet,
} from '../export.js';
import { readMesh } from '../../mesh.js';
import { platformInflate } from '../../zip.js';
import { analyse, orientations, plateLayout, fmtSize, mm3ToCm3 } from '../../geometry.js';
import { calculateOrder, comparePrinters } from '../../engine.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import { groupLabour } from '../../labour.js';
import { INFILL_PATTERNS, FACTOR_LABELS } from '../../profiles.js';
import { filamentSlots, mixEditor, filamentBreakdown } from '../filament-slots.js';
import { defaultSlots, reconcileSlots } from '../../filaments.js';
import { materialStock } from '../../inventory.js';
import { methodsForCountry } from '../../shipping.js';
import { ESTIMATE_LEVELS } from '../../estimate.js';
import { DEMAND_TARGETS } from '../../pricing.js';
import { makeProject, addPart, makePart } from '../../projects.js';
import { shareLink, replaceProject, saveSoon, defaultPart } from '../../state.js';

export const id = 'estimate';
export const name = 'Estimate';
export const short = 'Estimate';

/** The estimator's per-part slicer figures scaled to a whole-print total, which
 *  is how a project stores them (a project divides them back down by quantity). */
function totalSlicer(slicer, quantity) {
  if (!slicer) return null;
  const qty = Math.max(1, Math.round(num(quantity, 1)));
  if (qty === 1) return { ...slicer };
  return {
    ...slicer,
    grams: slicer.grams != null ? num(slicer.grams) * qty : slicer.grams,
    minutes: slicer.minutes != null ? num(slicer.minutes) * qty : slicer.minutes,
    heads: Array.isArray(slicer.heads)
      ? slicer.heads.map((h) => ({ ...h, grams: num(h.grams) * qty }))
      : slicer.heads,
  };
}

/** One `quick.part` turned into an order line the engine understands. */
function partToLine(part, quick) {
  return {
    id: part.id,
    partId: part.id,
    name: part.name,
    quantity: part.quantity,
    profileId: part.profileId,
    settingOverrides: part.settingOverrides,
    mix: part.mix,
    geometry: part.geometry,
    manual: part.manual,
    orientedSize: part.orientedSize,
    colourBands: part.colourBands,
    hardware: part.hardware,
    complexity: part.complexity,
    needsSupport: part.needsSupport,
    needsResin: part.needsResin,
    needsDeburring: part.needsDeburring,
    nfcCode: part.nfcCode,
    partsPerPlateOverride: part.partsPerPlateOverride,
    otherDirectCost: part.otherDirectCost,
    estimateMethod: part.estimateMethod,
    slicer: part.slicer,
    // The discount is a policy for the whole order, not one part type, so it
    // lives on `quick` and is copied onto every line here.
    discount: quick.discount,
  };
}

/** The priced order for whatever is currently on the bed. */
export function price(state) {
  const quick = state.quick;
  return calculateOrder({
    ...quick.order,
    plate: { printerId: quick.printerId, slots: quick.slots || defaultSlots(null, quick.materialId) },
    lines: quick.parts.map((part) => partToLine(part, quick)),
  }, state.settings);
}

/** Which part's detail (thirds, breakdown, labour, explain) is on screen. */
function selectedPart(state) {
  const parts = state.quick.parts;
  return parts.find((p) => p.id === state.ui.selectedEstimatePart) || parts[0];
}

/* ---------------------------------------------------------------- model -- */

async function loadModel(file, part, rerender) {
  try {
    const buffer = await file.arrayBuffer();
    const mesh = await readMesh(file.name, buffer, { inflate: platformInflate });
    const geometry = analyse(mesh);
    part.geometry = geometry;
    part.modelName = file.name;
    part.orientedSize = null;
    part.orientedUp = null;
    if (!part.name || /^Part \d+$/.test(part.name)) {
      part.name = file.name.replace(/\.[^.]+$/, '');
    }
    saveSoon();
    toast(`${file.name} measured: ${mm3ToCm3(geometry.volume).toFixed(1)} cm³`);
    rerender();
  } catch (error) {
    toast(error.message || 'That file could not be read');
  }
}

/** One part's whole editor: what it is, how much of it, and how it prints. */
function partBlock(ctx, part, index, canRemove) {
  const { state, rerender } = ctx;
  const key = part.id;
  const geometry = part.geometry;

  const set = (field) => (value) => { part[field] = value; saveSoon(); rerender(); };

  const input = el('input', {
    type: 'file',
    class: 'visually-hidden',
    'data-field': `model-file-${key}`,
    accept: '.stl,.obj,.3mf',
    on: {
      change: (e) => {
        const file = e.target.files?.[0];
        if (file) loadModel(file, part, rerender);
      },
    },
  });

  const drop = el('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    'data-field': `model-drop-${key}`,
    on: {
      click: () => input.click(),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      dragover: (e) => { e.preventDefault(); drop.classList.add('is-over'); },
      dragleave: () => drop.classList.remove('is-over'),
      drop: (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) loadModel(file, part, rerender);
      },
    },
  }, [
    el('strong', { text: part.modelName || 'Drop an STL, OBJ or 3MF here' }),
    el('span', { class: 'dropzone__hint', text: 'or click to choose a file — nothing is uploaded' }),
    input,
  ]);

  const modelBody = [drop];

  if (geometry && !geometry.manual) {
    const rows = [
      ['Bounding box', fmtSize(geometry.size)],
      ['Volume', `${mm3ToCm3(geometry.volume).toFixed(2)} cm³`],
      ['Surface area', `${(geometry.area / 100).toFixed(1)} cm²`],
      ['Triangles', geometry.triangleCount.toLocaleString()],
      ['Separate bodies', String(geometry.objects)],
      ['Closed surface', geometry.watertight ? 'Yes' : `No — ${geometry.openEdges} open edges`],
    ];
    modelBody.push(el('dl', { class: 'facts' }, rows.flatMap(([label, value]) => [
      el('dt', { text: label }),
      el('dd', { class: 'value', text: value }),
    ])));

    const options = orientations(geometry.size);
    const chosen = part.orientedSize
      ? options.findIndex((o) => o.up === part.orientedUp)
      : 0;
    modelBody.push(selectField(`orientation-${key}`, 'Orientation',
      options.map((o, i) => ({ value: String(i), label: `${o.up} up — ${o.height.toFixed(1)} mm tall` })),
      String(Math.max(0, chosen)),
      (value) => {
        const option = options[Number(value)] || options[0];
        part.orientedSize = option.size;
        part.orientedUp = option.up;
        saveSoon();
        rerender();
      }, {
        info: 'Height drives print time far harder than footprint does, so laying a '
          + 'part down is usually the biggest single saving available.',
      }));

    modelBody.push(buttonRow([
      button('Clear the model', () => {
        part.geometry = null;
        part.modelName = null;
        part.orientedSize = null;
        saveSoon();
        rerender();
      }, { key: `clear-model-${key}` }),
    ]));
  } else {
    modelBody.push(muted('No model loaded, so this part is measured from the dimensions '
      + 'below. Enter a volume if you know it — a bounding box alone assumes it fills '
      + '35% of it.'));
    const m = part.manual;
    const setManual = (field) => (value) => { m[field] = num(value); saveSoon(); rerender(); };
    modelBody.push(el('div', { class: 'field-grid' }, [
      numberField(`manual-x-${key}`, 'Length', m.x, setManual('x'), { min: 0, suffix: 'mm' }),
      numberField(`manual-y-${key}`, 'Width', m.y, setManual('y'), { min: 0, suffix: 'mm' }),
      numberField(`manual-z-${key}`, 'Height', m.z, setManual('z'), { min: 0, suffix: 'mm' }),
    ]));
    modelBody.push(numberField(`manual-volume-${key}`, 'Solid volume', m.volume, setManual('volume'), {
      min: 0, suffix: 'mm³', hint: 'Leave at zero to estimate it from the bounding box.',
    }));
  }

  // Quantity sits right under the model, exactly where the decision belongs:
  // upload the shape, then say how much of it is wanted.
  modelBody.push(numberField(`quantity-${key}`, 'Quantity', part.quantity,
    (v) => set('quantity')(Math.max(1, Math.round(num(v, 1)))), {
      min: 1, step: 1,
      info: 'More parts cost less each without any discount: setup and administration '
        + 'are spread across the batch and more fit on a plate.',
    }));

  modelBody.push(postProcessingSubsection(part, key, set, rerender, state.settings.hardware));

  /* -- print intent -------------------------------------------------------- */

  const profiles = state.settings.profiles;
  const profile = profiles.find((p) => p.id === part.profileId) || profiles[0];
  const merged = { ...profile.settings, ...part.settingOverrides };
  const overridden = Object.keys(part.settingOverrides).length > 0;

  const intentBody = [
    chips(`profile-${key}`, profiles.map((p) => ({ value: p.id, label: p.name, title: p.blurb })),
      part.profileId, (value) => {
        part.profileId = value;
        part.settingOverrides = {};
        saveSoon();
        rerender();
      }),
    muted(profile.blurb),
  ];

  if (state.mode !== 'simple') {
    const setOverride = (field) => (value) => {
      if (value === profile.settings[field]) delete part.settingOverrides[field];
      else part.settingOverrides[field] = value;
      saveSoon();
      rerender();
    };

    intentBody.push(subsection('This part’s settings', [
      sliderField(`infill-${key}`, FACTOR_LABELS.infill, merged.infill, setOverride('infill'), {
        min: 0, max: 100, step: 1, format: (v) => `${v}%`,
      }),
      selectField(`infill-pattern-${key}`, FACTOR_LABELS.infillPattern,
        INFILL_PATTERNS.map((p) => ({ value: p.id, label: p.name })),
        merged.infillPattern, setOverride('infillPattern')),
      sliderField(`walls-${key}`, FACTOR_LABELS.wallLoops, merged.wallLoops, setOverride('wallLoops'), {
        min: 1, max: 12, step: 1, format: (v) => `${v}`,
      }),
      selectField(`layer-height-${key}`, FACTOR_LABELS.layerHeight,
        [0.08, 0.1, 0.12, 0.15, 0.16, 0.2, 0.24, 0.28, 0.3].map((h) => ({ value: String(h), label: `${h} mm` })),
        String(merged.layerHeight), (v) => setOverride('layerHeight')(Number(v))),
      checkField(`shrinkage-${key}`, FACTOR_LABELS.shrinkage, merged.shrinkage, setOverride('shrinkage')),
      checkField(`angle-opt-${key}`, FACTOR_LABELS.angleOptimisation, merged.angleOptimisation, setOverride('angleOptimisation')),
      checkField(`ironing-${key}`, FACTOR_LABELS.ironing, merged.ironing, setOverride('ironing')),
      checkField(`fuzzy-${key}`, FACTOR_LABELS.fuzzySkin, merged.fuzzySkin, setOverride('fuzzySkin')),
      overridden
        ? buttonRow([button(`Back to the ${profile.name} profile`, () => {
          part.settingOverrides = {};
          saveSoon();
          rerender();
        }, { key: `reset-overrides-${key}` })])
        : null,
    ], {
      hint: overridden
        ? 'These differ from the saved profile. The quote records what was actually used.'
        : 'Changing anything here overrides the profile for this part only.',
    }));
  }

  /* -- how much of this part is each loaded filament ----------------------- */

  const settings = state.settings;
  const printer = settings.printers.find((p) => p.id === state.quick.printerId) || settings.printers[0];
  const liveSlots = reconcileSlots(
    state.quick.slots || defaultSlots(printer, state.quick.materialId),
    printer, settings.materials,
  ).slots;

  const mixBody = mixEditor({
    slots: liveSlots,
    materials: settings.materials,
    mix: part.mix,
    partName: part.name || 'this part',
    keyPrefix: `mix-${key}`,
    onMix: (next) => { part.mix = next; saveSoon(); rerender(); },
  });

  /* -- hardware -------------------------------------------------------------- */

  const hwCatalogue = settings.hardware.filter((h) => !h.archived);
  const hwRows = part.hardware.map((entry, hi) => el('div', { class: 'row-editor' }, [
    selectField(`hw-${key}-${hi}`, 'Component',
      hwCatalogue.map((h) => ({ value: h.id, label: h.name })),
      entry.hardwareId, (value) => { entry.hardwareId = value; saveSoon(); rerender(); }),
    numberField(`hw-qty-${key}-${hi}`, 'Per part', entry.qty,
      (v) => { entry.qty = Math.max(0, Math.round(num(v, 1))); saveSoon(); rerender(); },
      { min: 0, step: 1 }),
    button('Remove', () => { part.hardware.splice(hi, 1); saveSoon(); rerender(); },
      { key: `hw-remove-${key}-${hi}` }),
  ]));

  const hardwareBody = [
    part.hardware.length ? el('div', {}, hwRows) : muted('Magnets, nuts, inserts and NFC tags '
      + 'fitted during or after the print.'),
    buttonRow([button('Add a component', () => {
      part.hardware.push({ hardwareId: hwCatalogue[0]?.id, qty: 1 });
      saveSoon();
      rerender();
    }, { key: `hw-add-${key}` })]),
  ];

  /* -- advanced overrides and slicer figures -------------------------------- */

  const advancedBody = [
    numberField(`per-plate-${key}`, 'Parts per plate', part.partsPerPlateOverride, set('partsPerPlateOverride'), {
      min: 0, step: 1, hint: 'Zero lets the app work it out from the shared bed.',
    }),
    sliderField(`complexity-${key}`, 'Labour complexity', part.complexity, set('complexity'), {
      min: 0.5, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}×`,
      info: 'Scales every labour operation for this part. Use it for something fiddly '
        + 'to remove, clean or inspect.',
    }),
    moneyField(`other-direct-${key}`, 'Other direct cost per part', part.otherDirectCost,
      set('otherDirectCost'), settings.currencyCode),
  ];

  const slicer = part.slicer || { grams: 0, minutes: 0 };
  const slicerBody = [
    muted('Paste what your slicer says for this part and the app will use it instead of '
      + 'its own geometry.'),
    el('div', { class: 'field-grid' }, [
      numberField(`slicer-grams-${key}`, 'Material', slicer.grams,
        (v) => { part.slicer = { ...slicer, grams: num(v) }; saveSoon(); rerender(); }, { min: 0, suffix: 'g' }),
      numberField(`slicer-minutes-${key}`, 'Print time', slicer.minutes,
        (v) => { part.slicer = { ...slicer, minutes: num(v) }; saveSoon(); rerender(); }, { min: 0, suffix: 'min' }),
    ]),
    selectField(`estimate-method-${key}`, 'Which estimate to use',
      [{ value: 'auto', label: 'Best available (recommended)' },
        ...ESTIMATE_LEVELS.map((l) => ({ value: l.id, label: l.name }))],
      part.estimateMethod, (value) => { part.estimateMethod = value; saveSoon(); rerender(); }),
  ];

  const headerRow = el('div', { class: 'field-grid' }, [
    textField(`part-name-${key}`, 'Part name', part.name, set('name')),
  ]);

  return el('div', { class: 'part-block' }, [
    el('div', { class: 'part-block__head' }, [
      el('strong', { text: `Part ${index + 1}` }),
      canRemove ? button('Remove this part', () => {
        state.quick.parts.splice(index, 1);
        if (state.ui.selectedEstimatePart === part.id) state.ui.selectedEstimatePart = null;
        saveSoon();
        rerender();
      }, { key: `remove-part-${key}`, danger: true }) : null,
    ]),
    headerRow,
    subsection('Model', modelBody),
    subsection('Print intent', intentBody),
    ...mixBody,
    subsection('Embedded hardware', hardwareBody, { open: part.hardware.length > 0 }),
    state.mode !== 'simple' ? subsection('Advanced', advancedBody) : null,
    state.mode !== 'simple' ? subsection('Slicer figures', slicerBody) : null,
  ].filter(Boolean));
}

function partsSection(ctx) {
  const { state, rerender } = ctx;
  const quick = state.quick;

  const blocks = quick.parts.map((part, i) => partBlock(ctx, part, i, quick.parts.length > 1));

  return section('parts', quick.parts.length > 1 ? `Parts (${quick.parts.length})` : 'Model', [
    ...blocks,
    buttonRow([button('Add another part', () => {
      const next = defaultPart({ name: `Part ${quick.parts.length + 1}` });
      quick.parts.push(next);
      saveSoon();
      rerender();
    }, { key: 'add-part' })]),
    quick.parts.length > 1
      ? muted('Every part here shares one printer and one set of loaded filament, '
        + 'below — they print on the same bed, and their volumes and plates are '
        + 'combined on the invoice.')
      : null,
  ].filter(Boolean), { open: true });
}

/* -------------------------------------------------- machine and material -- */

function machineSection(ctx) {
  const { state, rerender } = ctx;
  const quick = state.quick;
  const settings = state.settings;
  const printer = settings.printers.find((p) => p.id === quick.printerId) || settings.printers[0];

  const liveSlots = reconcileSlots(
    quick.slots || defaultSlots(printer, quick.materialId),
    printer, settings.materials,
  ).slots;

  const body = [
    selectField('printer', 'Printer',
      settings.printers.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
      quick.printerId, (value) => { quick.printerId = value; saveSoon(); rerender(); }),

    ...filamentSlots({
      printer,
      slots: liveSlots,
      materials: settings.materials,
      countryId: settings.countryId,
      currencyCode: settings.currencyCode,
      keyPrefix: 'quick',
      onSlots: (next) => {
        quick.slots = next;
        quick.materialId = next[0]?.materialId || quick.materialId;
        saveSoon();
        rerender();
      },
    }),
  ];

  return section('machine', 'Printer and loaded filament', body, {
    open: true,
    info: 'What is loaded belongs to the bed, not to any one part — every model above '
      + 'draws from the same spools.',
  });
}

/* --------------------------------------------------------------- order -- */

function orderSection(ctx) {
  const { state, rerender } = ctx;
  const quick = state.quick;
  const settings = state.settings;
  const order = quick.order;
  const set = (key) => (value) => { order[key] = value; saveSoon(); rerender(); };

  const methods = methodsForCountry(settings.shipping, settings.countryId);

  const body = [
    selectField('shipping', 'Delivery',
      [{ value: 'auto', label: 'Cheapest that fits (recommended)' },
        ...methods.map((m) => ({ value: m.id, label: `${m.name} — ${fmtMoney(m.basePrice, settings.currencyCode)}` }))],
      order.shippingMethodId, set('shippingMethodId')),
    checkField('collected', 'Customer collects — no packaging either',
      order.packagingCollected, set('packagingCollected')),
  ];

  if (state.mode !== 'simple') {
    body.push(selectField('packaging-container', 'Packaging',
      [{ value: '', label: 'Choose automatically' },
        ...settings.packaging.filter((p) => p.kind === 'container').map((p) => ({ value: p.id, label: p.name }))],
      order.packagingContainerId || '', (value) => set('packagingContainerId')(value || null)));
    body.push(checkField('insured', 'Insure the shipment', order.insured, set('insured')));

    const extras = order.extras.map((extra, index) => el('div', { class: 'row-editor' }, [
      textField(`extra-name-${index}`, 'Service', extra.name,
        (v) => { extra.name = v; saveSoon(); rerender(); }),
      moneyField(`extra-amount-${index}`, 'Amount', extra.amount,
        (v) => { extra.amount = num(v); saveSoon(); rerender(); }, settings.currencyCode),
      button('Remove', () => { order.extras.splice(index, 1); saveSoon(); rerender(); },
        { key: `extra-remove-${index}` }),
    ]));
    body.push(subsection('Other services', [
      ...extras,
      buttonRow([button('Add a service', () => {
        order.extras.push({ name: 'Express handling', amount: 0 });
        saveSoon();
        rerender();
      }, { key: 'extra-add' })]),
    ], { hint: 'Anything the customer chose that is not the part itself. These sit '
      + 'outside the rule of thirds.' }));
  }

  const discount = quick.discount || { kind: 'none' };
  body.push(subsection('Customer discount', [
    selectField('discount-kind', 'Discount', [
      { value: 'none', label: 'No discount' },
      { value: 'percent', label: 'Percentage off' },
      { value: 'fixed', label: 'Fixed amount off each part' },
      { value: 'volume', label: 'Quantity tier' },
      { value: 'customer', label: 'Agreed price per part' },
    ], discount.kind, (value) => { quick.discount = { ...discount, kind: value }; saveSoon(); rerender(); }),
    discount.kind === 'percent'
      ? numberField('discount-percent', 'Percentage', discount.percent ?? 0,
        (v) => { quick.discount = { ...discount, percent: num(v) }; saveSoon(); rerender(); },
        { min: 0, max: 95, suffix: '%' })
      : null,
    discount.kind === 'fixed'
      ? moneyField('discount-amount', 'Amount off each part', discount.amount ?? 0,
        (v) => { quick.discount = { ...discount, amount: num(v) }; saveSoon(); rerender(); },
        settings.currencyCode)
      : null,
    discount.kind === 'customer'
      ? moneyField('discount-unit', 'Agreed price per part', discount.unitPrice ?? 0,
        (v) => { quick.discount = { ...discount, unitPrice: num(v) }; saveSoon(); rerender(); },
        settings.currencyCode)
      : null,
    discount.kind === 'volume'
      ? muted('Uses the quantity tiers in Settings. Remember the batch is already cheaper '
        + 'per part before any tier is applied.')
      : null,
  ], { hint: quick.parts.length > 1 ? 'Applies to every part on this bed.' : null }));

  return section('order', 'Order', body, { open: true });
}

/* ------------------------------------------------------------- pricing -- */

function pricingSection(ctx) {
  const { state, rerender } = ctx;
  const settings = state.settings;
  const set = (path, value) => {
    const parts = path.split('.');
    let node = settings;
    for (let i = 0; i < parts.length - 1; i += 1) node = node[parts[i]];
    node[parts[parts.length - 1]] = value;
    saveSoon();
    rerender();
  };

  return section('pricing', 'Pricing model', [
    selectField('preset', 'Pricing preset',
      settings.presets.map((p) => ({ value: p.id, label: p.name })),
      settings.presetId, (value) => { ctx.applyPreset(value); }, {
        hint: settings.presets.find((p) => p.id === settings.presetId)?.blurb,
      }),
    subsection('Rule of thirds', [
      numberField('commercial-share', 'Labour + growth share', settings.thirds.commercialShare,
        (v) => set('thirds.commercialShare', Math.max(0, num(v))), {
          min: 0, step: 0.1, suffix: '× CTC',
        }),
      numberField('profit-share', 'Profit + capital share', settings.thirds.profitShare,
        (v) => set('thirds.profitShare', Math.max(0, num(v))), { min: 0, step: 0.1, suffix: '× CTC' }),
      percentField('growth-client-share', 'Growth passed to the customer',
        num(settings.thirds.growthClientShare, 0.5),
        (v) => set('thirds.growthClientShare', Math.min(1, Math.max(0, num(v)))), {
          info: 'Half of the growth is handed back to the customer as a saving by default, so '
            + 'the quote lands under its ceiling. The profit third follows it. 0% keeps the '
            + 'full three-times price.',
        }),
      muted(`Ceiling price = CTC × ${(1 + num(settings.thirds.commercialShare) + num(settings.thirds.profitShare)).toFixed(2)}`
        + `, less ${(num(settings.thirds.growthClientShare, 0.5) * 100).toFixed(0)}% of the growth`),
    ]),
    subsection('Demand', [
      chips('demand-mode', [
        { value: 'manual', label: 'Set by hand' },
        { value: 'capacity', label: 'From capacity' },
      ], settings.demand.mode, (value) => set('demand.mode', value)),
      settings.demand.mode === 'manual'
        ? sliderField('demand', 'Demand multiplier', settings.demand.manualMultiplier,
          (v) => set('demand.manualMultiplier', v), {
            min: 0.5, max: 2, step: 0.05, format: (v) => `${v.toFixed(2)}×`,
          })
        : numberField('committed-hours', 'Machine hours committed this week',
          settings.demand.committedMachineHours,
          (v) => set('demand.committedMachineHours', Math.max(0, num(v))), { min: 0, suffix: 'h' }),
      selectField('demand-target', 'Demand applies to',
        DEMAND_TARGETS.map((t) => ({ value: t.id, label: t.name })),
        settings.thirds.demandTarget, (v) => set('thirds.demandTarget', v), {
          hint: DEMAND_TARGETS.find((t) => t.id === settings.thirds.demandTarget)?.hint,
        }),
    ]),
    subsection('Allowances', [
      percentField('ctc-allowance', 'General CTC allowance', settings.ctc.generalAllowance,
        (v) => set('ctc.generalAllowance', v), {
          info: 'Covers the small direct costs nobody itemises. Not shipping.',
        }),
      percentField('scrap-rate', 'Rejection allowance', settings.scrap.rate,
        (v) => set('scrap.rate', v)),
      selectField('scrap-mode', 'Rejection based on', [
        { value: 'percent', label: 'The allowance above' },
        { value: 'printer', label: 'Each printer’s recorded failure rate' },
        { value: 'historical', label: 'Your own production history' },
      ], settings.scrap.mode, (v) => set('scrap.mode', v)),
    ]),
  ], { open: false });
}

/* ---------------------------------------------------------------- stage -- */

function threeNumbers(result) {
  const code = result.currencyCode;
  const profit = result.parts.total - result.totals.trueCost;
  const units = result.unitCount;
  const forOrder = units === 1 ? 'for 1 part' : `for all ${units} parts`;

  return el('div', { class: 'three-numbers' }, [
    statTile('Cost to Company', fmtMoney(result.totals.costToCompany, code), {
      hint: `What it costs you to make · ${forOrder}`, big: true,
    }),
    statTile('Part price', fmtMoney(result.totals.partPrice, code), {
      hint: units === 1
        ? `Rule of thirds · profit ${fmtMoney(profit, code)}`
        : `${forOrder} · ${fmtMoney(result.totals.partPrice / units, code)} average`,
      big: true,
      tone: 'accent',
    }),
    statTile('Final invoice', fmtMoney(result.totals.finalInvoice, code), {
      hint: units === 1
        ? `What the customer pays · ${forOrder}`
        : `What the customer pays · ${forOrder} · `
          + `${fmtMoney(result.totals.finalInvoice / units, code)} average per part`,
      big: true,
      tone: 'ok',
    }),
  ]);
}

/**
 * The box the app would reach for, and what goes in it.
 *
 * The engine already chooses the cheapest container that fits every part and
 * adds the consumables; this just shows that choice so it can be trusted or
 * overridden, rather than only appearing as a line in the cost breakdown.
 */
function packagingPanel(result) {
  const code = result.currencyCode;
  const pk = result.packaging;
  if (!pk) return null;
  if (!pk.fits) {
    return banner('warn', 'Nothing in the packaging catalogue holds this order. Add a box in '
      + 'Catalogues → Packaging before it ships.');
  }
  if (!pk.container) return null; // collection: nothing is boxed

  const d = pk.outerDims;
  return el('div', { class: 'panel' }, [
    el('h3', { text: 'Suggested packaging' }),
    muted(`The cheapest container that fits all ${result.unitCount} `
      + `part${result.unitCount === 1 ? '' : 's'}: the ${pk.container.name} `
      + `(${Math.round(d.x)} × ${Math.round(d.y)} × ${Math.round(d.z)} mm inside). `
      + 'Change or add boxes and consumables in Catalogues → Packaging.'),
    table([
      { label: 'Goes in the parcel', key: 'name' },
      { label: 'Qty', align: 'right', mono: true, get: (l) => String(l.qty) },
      { label: 'Each', align: 'right', mono: true, get: (l) => fmtMoney(l.each, code) },
      { label: 'Cost', align: 'right', mono: true, get: (l) => fmtMoney(l.cost, code) },
    ], pk.lines, { compact: true }),
    muted(`Packaging ${fmtMoney(pk.cost, code)} · parcel weighs about `
      + `${(pk.weightG / 1000).toFixed(2)} kg with the parts in it.`),
  ]);
}

/** Every part type on this bed, in one table, so a shared bed is legible. */
function partsTable(result) {
  if (result.lines.length < 2) return null;
  const code = result.currencyCode;
  return el('div', { class: 'panel' }, [
    el('h3', { text: 'Parts on this bed' }),
    table([
      { label: 'Part', key: 'name' },
      { label: 'Qty', align: 'right', mono: true, get: (l) => String(l.quantity) },
      { label: 'Per plate', align: 'right', mono: true, get: (l) => String(l.perPlate) },
      { label: 'Plates', align: 'right', mono: true, get: (l) => String(l.jobs) },
      { label: 'Material', align: 'right', mono: true, get: (l) => `${l.estimate.grams.toFixed(1)} g` },
      { label: 'CTC', align: 'right', mono: true, get: (l) => fmtMoney(l.ctc, code) },
      { label: 'Price each', align: 'right', mono: true, get: (l) => fmtMoney(l.unitPrice, code) },
      { label: 'Line total', align: 'right', mono: true, get: (l) => fmtMoney(l.lineTotal, code) },
    ], result.lines),
    muted('Every part type here shares the printer and the loaded filament above. Their '
      + 'volumes are added together for the physical plates the bed needs.'),
  ]);
}

/**
 * Post-processing: the finishing that happens after the print, tucked into a
 * dropdown because a part that ships straight off the printer needs none of it.
 * Support removal, resin, deburring, coding an embedded NFC tag, and fitting any
 * after-print hardware (turning a component that would ship loose into an
 * assembled product).
 */
function postProcessingSubsection(part, key, set, rerender, catalogue) {
  const specOf = (e) => catalogue.find((h) => h.id === e.hardwareId);
  const nfcOnPart = (part.hardware || []).some((e) => specOf(e)?.nfc && num(e.qty, 1) > 0);
  const afterEntries = (part.hardware || [])
    .map((e, i) => ({ e, i, spec: specOf(e) }))
    .filter((x) => x.spec && x.spec.stage === 'after' && num(x.e.qty, 1) > 0);

  const body = [
    checkField(`support-${key}`, 'Remove support', part.needsSupport, set('needsSupport'), {
      hint: 'Cut away and clean off support material — only on parts that print with it.',
    }),
    checkField(`resin-${key}`, 'Resin coat (top surface)', part.needsResin, set('needsResin'), {
      hint: 'Resin over the top face, priced by top area with a curing time. Rates in Settings → Labour.',
    }),
    checkField(`deburr-${key}`, 'Deburring / cleanup', part.needsDeburring, set('needsDeburring'), {
      hint: 'Deburr, trim seams, wipe down. Leave off to ship the part exactly as it comes off the printer.',
    }),
    ...afterEntries.map(({ e, i, spec }) => checkField(`fit-${key}-${i}`,
      `Fit the ${spec.name.toLowerCase()}`, e.fit === true,
      (v) => { e.fit = v; saveSoon(); rerender(); }, {
        hint: e.fit === true
          ? 'Assembled onto the part before it ships — a finished product.'
          : 'Otherwise it ships loose in the box for the customer to fit themselves.',
      })),
  ];
  if (nfcOnPart) {
    body.push(checkField(`nfc-${key}`, 'Code the NFC tag', !!part.nfcCode, set('nfcCode'), {
      hint: 'This part has an embedded NFC tag. Tick to code it — the coding time is set in '
        + 'Settings → Labour → Post-processing.',
    }));
    if (part.nfcCode) {
      body.push(textField(`nfc-url-${key}`, 'Link to code onto the tag', part.nfcUrl || '',
        set('nfcUrl'), { placeholder: 'https://…' }));
    }
  }

  // Collapsed by default: a part that ships straight off the printer needs none
  // of this, so it stays out of the way until opened. The open/closed choice is
  // remembered per part.
  return section(`pp-${key}`, 'Post-processing', body, { open: false });
}

/**
 * Multi-colour planner: colour by Z-height per part.
 *
 * Each part's colour is a set of bands up its height. The machine loads its
 * heads with the first colours from the bottom; a colour beyond them is reached
 * by pausing at its height and swapping a spool by hand — labour, a machine
 * wait, and no overnight run. Across parts, the distinct colours are packed onto
 * the fewest plates, a shared colour counting once.
 */
function colourPlatesPanel(state, rerender) {
  const settings = state.settings;
  const printer = settings.printers.find((p) => p.id === state.quick.printerId) || settings.printers[0];
  const limit = slotLimit(printer);
  const materials = settings.materials.filter((m) => !m.archived);
  const parts = state.quick.parts;
  const label = (id) => {
    const m = materials.find((x) => x.id === id) || settings.materials.find((x) => x.id === id);
    return m ? `${m.colour} ${m.name}` : id;
  };
  const bandsOf = (part) => (Array.isArray(part.colourBands) ? part.colourBands : []);
  const coloursOf = (part) => [...new Set(bandsOf(part).map((b) => b.materialId).filter(Boolean))];
  const anyColours = parts.some((p) => coloursOf(p).length > 0);

  const partRows = parts.map((part) => {
    const bands = bandsOf(part);
    const plan = partColourPlan(bands, { heads: limit });
    const swap = swapCost(plan.swapCount, {
      swapLabourMinutes: settings.colour.swapLabourMinutes,
      swapWaitMinutes: settings.colour.swapWaitMinutes,
    });

    const bandRows = bands.map((b, i) => el('div', { class: 'row-editor' }, [
      selectField(`band-mat-${part.id}-${i}`, '',
        materials.map((m) => ({ value: m.id, label: `${m.colour} ${m.name}` })),
        b.materialId || materials[0]?.id, (v) => { b.materialId = v; saveSoon(); rerender(); }),
      numberField(`band-upto-${part.id}-${i}`, '', b.upTo ?? '',
        (v) => { b.upTo = v == null ? null : Math.max(0, num(v)); saveSoon(); rerender(); },
        { min: 0, step: 1, suffix: 'mm to' }),
      button('Remove', () => { part.colourBands = bands.filter((_, j) => j !== i); saveSoon(); rerender(); },
        { key: `band-rm-${part.id}-${i}`, danger: true }),
    ]));

    return el('div', { class: 'part-block' }, [
      el('strong', { text: part.name || 'Part' }),
      bands.length
        ? el('div', {}, bandRows)
        : muted('No colour bands — this part prints in one colour.'),
      button('Add a band', () => {
        part.colourBands = [...bands, { materialId: materials[0]?.id, upTo: null }];
        saveSoon(); rerender();
      }, { key: `band-add-${part.id}` }),
      plan.swapCount > 0
        ? el('div', {}, [
          banner('warn', `${plan.swapCount} hand swap${plan.swapCount === 1 ? '' : 's'} — this part `
            + `uses ${plan.colours.length} colours but ${printer.name} loads ${limit}. `
            + `Adds ${swap.labourMinutes} min labour and ${swap.waitMinutes} min paused, and it can `
            + 'never run overnight.'),
          ...plan.swaps.map((s) => muted(`at ${Math.round(num(s.atHeight))} mm: ${label(s.from)} → ${label(s.to)}`)),
        ])
        : bands.length ? muted(`All ${plan.colours.length} colours load in the heads — no hand swaps.`) : null,
    ]);
  });

  const split = splitByColour(parts.map((p) => ({ id: p.id, colours: coloursOf(p) })), limit);
  const nameOfPart = (id) => parts.find((p) => p.id === id)?.name || 'Part';
  const platesView = [];
  if (anyColours && parts.length > 1) {
    platesView.push(split.splits > 0
      ? banner('warn', `Across the bed these need ${split.plateCount} plates: ${printer.name} holds `
        + `${limit} spools, and a shared colour counts once.`)
      : muted(`All the parts’ colours fit on one bed — ${printer.name} holds ${limit} at once.`));
    platesView.push(...split.plates.map((plate, i) => el('div', { class: 'part-block' }, [
      el('strong', { text: `Plate ${i + 1}` }),
      muted(`Colours: ${plate.colours.map(label).join(', ') || 'none'}`),
      muted(`Parts: ${plate.parts.map(nameOfPart).join(', ')}`),
    ])));
  }

  const swaps = parts.some((p) => partColourPlan(bandsOf(p), { heads: limit }).swapCount > 0);
  return section('colour-plates', 'Multi-colour (by height)', [
    muted(`Give each part its colours as bands up its height. ${printer.name} loads ${limit} at once; `
      + 'a colour beyond that is a hand swap at its height — labour, a machine wait, and no overnight run.'),
    ...partRows,
    ...platesView,
  ], { open: anyColours && (swaps || split.splits > 0) });
}

/** The "fill a plate, save per part" panel for the selected part. */
function savingsPanel(state, part) {
  if (!part) return null;
  try {
    const quick = state.quick;
    const saving = plateSaving(partToLine(part, quick), state.settings, {
      plate: { printerId: quick.printerId, slots: quick.slots || defaultSlots(null, quick.materialId) },
    });
    const chart = savingsChart(saving, state.settings.currencyCode);
    return chart ? el('div', { class: 'panel' }, [
      el('h3', { text: 'Fill a plate, save per part' }),
      chart,
    ]) : null;
  } catch {
    return null;
  }
}

/** A human note for the post-processing cost row: what it covers, and curing. */
function postProcessNote(pp) {
  if (!pp) return '';
  const bits = [];
  if (pp.resinOn) bits.push(`resin over ${pp.areaCm2.toFixed(1)} cm²`);
  if (pp.nfcTags) bits.push(`${pp.nfcTags} NFC tag${pp.nfcTags === 1 ? '' : 's'} coded`);
  if (pp.curingMinutes) bits.push(`${Math.round(pp.curingMinutes)} min curing (unattended)`);
  return bits.join(' · ');
}

function breakdown(line, result, settings) {
  const code = result.currencyCode;

  return el('div', { class: 'panel breakdown' }, [
    el('h3', { text: `${line.name} — ${line.quantity} off` }),
    costRow('Material', line.production.material, code, {
      note: (line.filaments.length > 1
        ? `${line.estimate.grams.toFixed(1)} g each across ${line.filaments.length} filaments`
        : `${line.estimate.grams.toFixed(1)} g each at ${fmtMoney(line.detail.perGram, code)}/g`)
        + (line.quantity > 1
          ? ` · ${(line.estimate.grams * line.quantity).toFixed(1)} g for all ${line.quantity}`
          : ''),
    }),
    filamentBreakdown(line, code),
    costRow('Machine', line.production.machine, code, {
      note: `${Math.round(line.detail.machineMinutes)} min at ${fmtMoney(line.detail.machineRate.total, code)}/h`,
    }),
    costRow('Electricity', line.production.electricity, code, {
      note: `${line.detail.electricity.total.toFixed(3)} kWh`,
    }),
    line.production.labourInCtc ? costRow('Labour', line.production.labour, code, {
      note: `${Math.round(line.detail.labour.minutesPerUnit)} min at ${fmtMoney(line.detail.labour.rate, code)}/h`,
    }) : null,
    line.production.hardware ? costRow('Hardware', line.production.hardware, code, {
      note: `${line.detail.hardware.inserts} fitted`,
    }) : null,
    line.production.postProcess ? costRow('Post-processing', line.production.postProcess, code, {
      note: postProcessNote(line.detail.postProcess),
    }) : null,
    line.production.afterHardware ? costRow('Fitted / supplied components', line.production.afterHardware, code, {
      note: 'after-print hardware',
    }) : null,
    line.detail.swap && line.detail.swap.labourCost > 0 ? costRow('Manual colour swaps', line.detail.swap.labourCost, code, {
      note: `${line.detail.swap.swaps} swap${line.detail.swap.swaps === 1 ? '' : 's'} by hand · `
        + `${Math.round(line.detail.swap.waitMinutes)} min paused · attended-only`,
    }) : null,
    line.production.other ? costRow('Other direct', line.production.other, code) : null,
    costRow('Rejection allowance', line.production.scrapAllowance, code, {
      note: `${line.detail.scrap.attempts.toFixed(2)} attempts per good part`,
    }),
    costRow('Production cost', line.production.total, code, { strong: true }),
    costRow(`General allowance ${fmtRate(line.production.allowanceRate)}`, line.production.generalAllowance, code, { sub: true }),
    costRow('Cost to Company', line.ctc, code, {
      strong: true,
      info: line.production.labourInCtc
        ? 'Everything the part cost to make, labour included.'
        : 'The physical cost of the part. Labour is recovered separately and '
          + 'once, rather than being multiplied by the thirds.',
    }),
    !line.production.labourInCtc
      ? costRow('Labour', line.production.labourRecovered, code, {
        note: `${Math.round(line.detail.labour.minutesPerUnit)} min each at `
          + `${fmtMoney(line.detail.labour.rate, code)}/h — broken down below`,
      })
      : null,
    !line.production.labourInCtc
      ? costRow('What the job cost', line.production.trueCost, code, { strong: true })
      : null,

    el('hr', { class: 'rule' }),
    costRow('Tank 1 — Cost to Company', line.price.recovery, code, { sub: true }),
    costRow('Tank 2 — labour and growth', line.price.labourAndGrowth, code, {
      sub: true,
      note: line.price.labourOverflowed
        ? `the work came to ${fmtMoney(line.price.labour, code)}, more than its `
          + `${fmtMoney(line.price.nominalShare, code)} share, so the tank is that big`
        : `${fmtMoney(line.price.labour, code)} of work, `
          + `${fmtMoney(line.price.commercial, code)} of growth`,
    }),
    costRow('Tank 3 — profit and capital', line.price.profit, code, {
      sub: true,
      note: 'half of the two tanks above, because they are two thirds',
    }),
    line.price.growthSaved > 0.005
      ? muted(`Growth split: ${(line.price.growthClientShare * 100).toFixed(0)}% of the growth `
        + `(${fmtMoney(line.price.growthSaved, code)} each) is handed back to the customer as a `
        + 'saving, so the three tanks above are already after it.')
      : null,
    costRow('Part price, each', line.price.price, code, { strong: true }),
    line.quantity > 1
      ? costRow(`× ${line.quantity} parts`, line.lineTotalBeforeDiscount, code, { strong: true })
      : null,
    line.discount.amount
      ? costRow(line.discount.label, -line.discount.amount, code, { sub: true })
      : null,
    line.discount.amount ? costRow('After discount', line.unitPrice, code, { strong: true }) : null,

    el('hr', { class: 'rule' }),
    costRow(`${line.quantity} × ${fmtMoney(line.unitPrice, code)}`, line.lineTotal, code, { strong: true }),
    result.lines.length > 1
      ? muted('Packaging, shipping and tax below are for the whole order, not just this part.')
      : null,
    costRow('Packaging', result.orderExtras.packaging, code, {
      note: result.packaging.container?.name || 'none',
    }),
    costRow(result.shipping.free ? 'Shipping (free)' : 'Shipping', result.orderExtras.shipping, code, {
      note: result.shipping.method?.name || 'not selected',
    }),
    result.orderExtras.handling ? costRow('Handling', result.orderExtras.handling, code) : null,
    result.orderExtras.storage ? costRow('Storage', result.orderExtras.storage, code) : null,
    ...result.orderExtras.extras.map((x) => costRow(x.name, x.amount, code)),
    costRow('Net', result.totals.net, code, { strong: true }),
    result.tax.tax ? costRow(`${settings.tax.name} ${fmtRate(result.tax.rate)}`, result.tax.tax, code) : null,
    costRow('Final invoice', result.totals.finalInvoice, code, { strong: true }),
  ]);
}

/**
 * Where the labour minutes actually went.
 *
 * "18 minutes" on a small part is not obviously true, and a number nobody can
 * check is a number nobody believes. Every operation is listed with what it
 * scales with, how many times it happened, and what that came to - so the
 * total can be read down the column.
 */
function labourPanel(line, code, settings) {
  const d = line.detail.labour;
  const groups = groupLabour(d.lines);
  const quantity = line.quantity;

  const rows = groups.flatMap((group) => [
    { group: group.name, isGroup: true, minutes: group.minutes, cost: group.cost },
    ...group.lines.map((l) => ({ ...l, isGroup: false })),
  ]);

  const scopeLabel = {
    order: 'once for the order',
    job: 'once per plate',
    extraJob: 'per extra plate',
    unit: 'per part',
    supportUnit: 'per supported part',
    colourChange: 'per hand change',
    hardwareInsert: 'per insert',
  };

  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: `Where ${line.name}’s labour goes` }),
      el('span', {
        class: 'muted',
        text: `${Math.round(d.minutes)} min over ${quantity} part${quantity === 1 ? '' : 's'}`
          + ` · ${Math.round(d.minutesPerUnit)} min each · ${fmtMoney(d.rate, code)}/h`,
      }),
    ]),
    buttonRow([button('Print work sheet', () => {
      const host = document.getElementById('print-host');
      buildLabourSheet(line, { host, currencyCode: code, company: settings.company });
      document.body.classList.add('printing');
      printSheet();
      setTimeout(() => document.body.classList.remove('printing'), 500);
    }, { key: `labour-sheet-${line.partId || line.name}` })]),
    table([
      {
        label: 'Operation',
        get: (r) => (r.isGroup
          ? el('strong', { text: r.group })
          : el('span', { text: r.name })),
      },
      { label: 'When', get: (r) => (r.isGroup ? '' : (scopeLabel[r.per] || r.per)) },
      { label: 'Times', align: 'right', mono: true, get: (r) => (r.isGroup ? '' : String(r.count)) },
      {
        label: 'Each',
        align: 'right',
        mono: true,
        get: (r) => (r.isGroup ? '' : `${r.minutesEach} min`),
      },
      {
        label: 'Minutes',
        align: 'right',
        mono: true,
        get: (r) => `${r.minutes.toFixed(1)}`,
      },
      {
        label: 'Per part',
        align: 'right',
        mono: true,
        get: (r) => `${(r.minutes / quantity).toFixed(1)} min`,
      },
      { label: 'Cost', align: 'right', mono: true, get: (r) => fmtMoney(r.cost / quantity, code) },
    ], rows.map((r) => ({ ...r, className: r.isGroup ? 'is-group' : null })), { compact: true }),
    muted('Order and plate work is done once however many parts there are, so it is '
      + 'divided across them — which is why the same part costs less labour each in a '
      + 'batch. Change any of these in Settings → Labour.'),
  ]);
}

function comparison(ctx, part, result) {
  const { state, rerender } = ctx;
  if (!state.ui.comparePrinters) {
    return buttonRow([button('Compare every printer', () => {
      state.ui.comparePrinters = true;
      saveSoon();
      rerender();
    }, { key: 'compare-open' })]);
  }

  const quick = state.quick;
  const rows = comparePrinters({
    ...partToLine(part, quick),
    materialId: quick.materialId,
  }, state.settings);

  const code = result.currencyCode;
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: `${part.name} on every machine` }),
      button('Hide', () => { state.ui.comparePrinters = false; saveSoon(); rerender(); }, { key: 'compare-close' }),
    ]),
    muted('The cheapest machine-hour does not always make the cheapest part: a slower '
      + 'flow rate, more setup and a higher failure rate all land on the finished part.'),
    table([
      { label: 'Printer', get: (r) => r.printer.name },
      { label: 'Machine hour', align: 'right', mono: true, get: (r) => fmtMoney(r.machineHourCost, code) },
      { label: 'Time', align: 'right', mono: true, get: (r) => `${Math.round(r.minutes)} min` },
      { label: 'Material', align: 'right', mono: true, get: (r) => `${r.grams.toFixed(1)} g` },
      { label: 'Scrap', align: 'right', mono: true, get: (r) => fmtRate(r.scrapRate) },
      { label: 'CTC', align: 'right', mono: true, get: (r) => fmtMoney(r.ctc, code) },
      { label: 'Price', align: 'right', mono: true, get: (r) => fmtMoney(r.unitPrice, code) },
      {
        label: '',
        get: (r) => (r.blocked
          ? pill(r.fits ? 'Material' : 'Too big', 'danger')
          : button('Use', () => {
            state.quick.printerId = r.printer.id;
            saveSoon();
            rerender();
          }, { key: `use-${r.printer.id}` })),
      },
    ], rows.map((r) => ({ ...r, className: r.blocked ? 'is-blocked' : null }))),
  ]);
}

function allocationPanel(result) {
  const code = result.currencyCode;
  return el('div', { class: 'panel' }, [
    el('h3', { text: 'Where the commercial share goes' }),
    muted('These weights divide up money already charged. They are not added to the '
      + 'price — that would be a 152% markup nobody decided on.'),
    table([
      { label: 'Bucket', key: 'name' },
      { label: 'Weight', align: 'right', mono: true, get: (r) => `${(r.weight * 100).toFixed(0)}%` },
      { label: 'Share', align: 'right', mono: true, get: (r) => fmtRate(r.share) },
      { label: 'Amount', align: 'right', mono: true, get: (r) => fmtMoney(r.amount, code) },
      {
        label: '',
        get: (r) => (r.overlapsDirect
          ? pill('already charged directly', 'warn')
          : ''),
      },
    ], result.allocation.lines),
  ]);
}

/* ---------------------------------------------------------------- tool --- */

export function sidebar(ctx) {
  const { state } = ctx;
  return [
    partsSection(ctx),
    machineSection(ctx),
    orderSection(ctx),
    state.mode !== 'simple' ? pricingSection(ctx) : null,
    exportSection(ctx),
  ].filter(Boolean);
}

function exportSection(ctx) {
  const { state, rerender, stageSvgs } = ctx;
  return section('export', 'Export and save', [
    buttonRow([
      button('Copy a share link', () => copyText(shareLink()), { key: 'share' }),
      button('CSV', () => downloadCsv(orderCsv(price(state)), 'estimate'), { key: 'csv' }),
    ]),
    buttonRow([
      button('SVG', () => {
        const node = stageSvgs()[0];
        if (node) downloadSvg(node, 'cost-breakdown');
      }, { key: 'svg' }),
      button('PNG', () => {
        const node = stageSvgs()[0];
        if (node) downloadPng(node, 'cost-breakdown');
      }, { key: 'png' }),
    ]),
    buttonRow([
      button('Save this bed as a project', () => {
        let project = makeProject({
          name: state.quick.name || 'New project',
          order: { ...state.quick.order },
        });
        for (const part of state.quick.parts) {
          project = addPart(project, makePart({
            name: part.name || 'Part',
            quantity: part.quantity,
            profileId: part.profileId,
            settingOverrides: { ...part.settingOverrides },
            printerId: state.quick.printerId,
            materialId: state.quick.materialId,
            geometry: part.geometry,
            manual: { ...part.manual },
            orientedSize: part.orientedSize,
            // The bed's loaded filament is shared by every part; a project keeps
            // it per part, so each carries a copy along with its own mix.
            slots: (state.quick.slots || []).map((s) => ({ ...s })),
            mix: Array.isArray(part.mix) ? part.mix.map((m) => ({ ...m })) : null,
            hardware: part.hardware.map((h) => ({ ...h })),
            complexity: part.complexity,
            // The post-processing choices belong to the part, so they travel too.
            needsSupport: part.needsSupport,
            needsResin: part.needsResin,
            needsDeburring: part.needsDeburring,
            nfcCode: part.nfcCode,
            nfcUrl: part.nfcUrl,
            // A project's slicer figures are totals for the whole print; the
            // estimator's are per part, so scale them up on the way in.
            slicer: totalSlicer(part.slicer, part.quantity),
            discount: state.quick.discount,
          }));
        }
        replaceProject(project);
        state.activeProjectId = project.id;
        state.tool = 'projects';
        toast(`Saved as “${project.name}” with ${state.quick.parts.length} part`
          + `${state.quick.parts.length === 1 ? '' : 's'}`);
        rerender();
      }, { primary: true, key: 'save-project' }),
    ]),
    muted('A share link puts the estimate in the URL fragment, which browsers never '
      + 'send to a server. Nothing here leaves your device.'),
  ], { open: false });
}

export function main(ctx) {
  const { state, rerender } = ctx;
  const result = price(state);
  const settings = state.settings;
  const code = result.currencyCode;
  const detailPart = selectedPart(state);
  const line = result.lines.find((l) => l.partId === detailPart?.id) || result.lines[0];

  const nodes = [threeNumbers(result)];

  const allNotes = result.notes.concat(result.lines.flatMap((l) => l.notes || []));
  for (const note of dedupe(allNotes)) {
    nodes.push(banner(note.level, note.text));
  }

  nodes.push(stockFlags(result, state.inventory));
  nodes.push(partsTable(result));

  if (result.lines.length > 1) {
    nodes.push(chips('select-part',
      result.lines.map((l) => ({ value: l.partId, label: l.name })),
      line?.partId, (partId) => {
        state.ui.selectedEstimatePart = partId;
        saveSoon();
        rerender();
      }));
  }

  if (!line) {
    nodes.push(emptyState('Add a part to see the price worked out.'));
    return nodes.filter(Boolean);
  }

  // Production and part-price bars sum across every part sharing the bed;
  // the invoice bar already is order-wide.
  const sumOver = (pick) => result.lines.reduce((t, l) => t + pick(l) * l.quantity, 0);

  nodes.push(el('div', { class: 'viewport__stage' }, [
    moneyDiagram({
      currencyCode: code,
      title: result.lines.length > 1
        ? `Production, part price and invoice — one scale, for the whole bed `
          + `(${result.unitCount} parts)`
        : `Production, part price and invoice — one scale, for all `
          + `${line.quantity} part${line.quantity === 1 ? '' : 's'}`,
      rows: [
        {
          name: 'Production',
          rows: [
            { label: 'Material', amount: sumOver((l) => l.production.material) },
            { label: 'Machine', amount: sumOver((l) => l.production.machine) },
            { label: 'Electricity', amount: sumOver((l) => l.production.electricity) },
            ...(line.production.labourInCtc
              ? [{ label: 'Labour', amount: sumOver((l) => l.production.labour) }] : []),
            { label: 'Hardware', amount: sumOver((l) => l.production.hardware) },
            { label: 'Other direct', amount: sumOver((l) => l.production.other) },
            { label: 'Rejection allowance', amount: sumOver((l) => l.production.scrapAllowance) },
            { label: 'General allowance', amount: sumOver((l) => l.production.generalAllowance) },
          ],
        },
        {
          name: 'Part price',
          rows: [
            { label: 'Cost recovery', amount: sumOver((l) => l.price.recovery) },
            { label: 'Labour', amount: sumOver((l) => l.price.labour) },
            { label: 'Growth', amount: sumOver((l) => l.price.commercial) },
            { label: 'Profit + capital', amount: sumOver((l) => l.price.profit) },
          ],
        },
        {
          name: 'Invoice',
          rows: [
            { label: 'Parts', amount: result.parts.total },
            { label: 'Packaging', amount: result.orderExtras.packaging },
            { label: 'Shipping', amount: result.orderExtras.shipping },
            { label: 'Handling', amount: result.orderExtras.handling },
            { label: 'Storage', amount: result.orderExtras.storage },
            { label: 'Other services', amount: result.orderExtras.extrasTotal },
            { label: settings.tax.name || 'Tax', amount: result.tax.tax },
          ],
        },
      ],
    }),
  ]));

  nodes.push(el('div', { class: 'viewport__stage' }, [
    thirdsDiagram({ price: line.price, currencyCode: code }),
  ]));

  const geometry = line.geometry;
  const printer = settings.printers.find((p) => p.id === line.printer.id);

  // One picture: the build-volume cage AND every part standing on the plate,
  // so "will it fit and how tall" and "where do they go and how many" are the
  // same drawing.
  const orientedSize = detailPart?.orientedSize || geometry.size;
  const towerArea = line.detail.tower?.needed
    ? num(line.detail.tower.x) * num(line.detail.tower.y) : 0;
  // Draw only as many as actually go on the first plate: the whole plate holds
  // `perPlate`, but if fewer are ordered than that, fewer are shown.
  const layout = plateLayout(orientedSize, printer?.build || {}, {
    reservedArea: towerArea,
    max: Math.min(line.quantity, line.perPlate),
  });
  nodes.push(el('div', { class: 'stage-pair' }, [
    el('div', { class: 'viewport__stage' }, [
      plateInBuildVolume({
        build: printer?.build,
        layout,
        size: orientedSize,
        fits: line.fit.fits,
        printerName: line.printer.name,
      }),
    ]),
    el('div', { class: 'viewport__stage' }, [
      orientationChart({
        options: orientations(geometry.size),
        chosenIndex: 0,
      }),
    ]),
  ]));

  nodes.push(el('div', { class: 'summary-grid' }, [
    statTile(`${line.name} — material`, `${line.estimate.grams.toFixed(1)} g`, {
      hint: line.estimate.level.short,
    }),
    statTile('Print time each', `${Math.round(line.estimate.minutes)} min`),
    statTile('Per plate', String(line.perPlate), {
      hint: [
        `${line.jobs} run${line.jobs === 1 ? '' : 's'}`,
        line.detail.tower.needed ? `tower ${line.detail.tower.x}×${line.detail.tower.y}` : null,
      ].filter(Boolean).join(' · '),
      tone: line.jobs > 1 ? 'warn' : null,
    }),
    statTile('Lead time', `${result.capacity.leadDays} days`),
    // The one figure a customer actually compares against a rival's quote:
    // the whole invoice, however many part types share the bed, divided by
    // every part in it.
    statTile('Average per part', fmtMoney(result.unitCount > 0
      ? result.totals.finalInvoice / result.unitCount : 0, code), {
      hint: `whole invoice ${fmtMoney(result.totals.finalInvoice, code)} ÷ `
        + `${result.unitCount} part${result.unitCount === 1 ? '' : 's'}`,
      tone: 'ok',
    }),
    statTile('Margin on parts', fmtRate(result.parts.total > 0
      ? (result.parts.total - result.totals.trueCost) / result.parts.total : 0), {
      hint: 'after everything the job cost, labour included',
    }),
    statTile('Demand', `${result.demand.multiplier.toFixed(2)}×`, { hint: result.demand.mode }),
  ]));

  nodes.push(packagingPanel(result));

  const saveChart = savingsPanel(state, detailPart);
  if (saveChart) nodes.push(saveChart);

  nodes.push(colourPlatesPanel(state, rerender));

  if (state.mode !== 'simple') {
    nodes.push(breakdown(line, result, settings));
    nodes.push(labourPanel(line, code, settings));
    nodes.push(comparison(ctx, detailPart, result));
    nodes.push(allocationPanel(result));
  }

  return nodes.filter(Boolean);
}

export function explain(ctx) {
  const { state } = ctx;
  const result = price(state);
  const detailPart = selectedPart(state);
  const line = result.lines.find((l) => l.partId === detailPart?.id) || result.lines[0];
  if (!line) return [emptyState('Add a part to see how the price is worked out.')];
  return [...explainLine(line, result, state.settings), ...explainOrder(result, state.settings)];
}

/**
 * What this whole order needs off the shelf, and whether it is there.
 *
 * Grams are totalled per material across every part and colour, then checked
 * against inventory. A material nobody tracks is passed over in silence; a
 * tracked one that falls short is called out with what to buy.
 */
function stockFlags(result, inventory) {
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

  const short = [];
  let anyTracked = false;
  let allEnough = true;
  for (const [id, entry] of need) {
    const s = materialStock(inventory, id, entry.grams);
    if (!s.tracked) continue;
    anyTracked = true;
    if (!s.enough) {
      allEnough = false;
      short.push(`${entry.name} — need ${entry.grams.toFixed(0)} g, have ${s.onHandG.toFixed(0)} g`
        + `${s.inStock ? '' : ' (none in stock)'}`);
    }
  }

  if (short.length) {
    return banner('warn', `Stock check — buy before printing: ${short.join('; ')}. `
      + 'Record spools in Inventory to keep this accurate.');
  }
  if (anyTracked && allEnough) {
    return banner('ok', 'Every filament this job needs is in stock.');
  }
  return null;
}

/** The same message from two sources is one message. */
function dedupe(notes) {
  const seen = new Set();
  return notes.filter((note) => {
    if (seen.has(note.text)) return false;
    seen.add(note.text);
    return true;
  });
}
