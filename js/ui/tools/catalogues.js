/**
 * The catalogues: printers, materials, shipping, packaging, hardware and
 * customers.
 *
 * Editing a printer's purchase price changes the machine-hour cost, which
 * changes every quote made from now on. That is the point - and it is why the
 * machine-hour breakdown is shown right next to the fields that produce it,
 * rather than being something the reader has to go and find.
 */

import { el, toast } from '../dom.js';
import {
  section, subsection, numberField, textField, selectField, checkField, chips,
  button, buttonRow, table, muted, statTile, pill, banner, emptyState, moneyField,
  percentField,
} from '../controls.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import {
  machineHourCost, byMachineHourCost, lifetimeHours, paybackHours, COLOUR_MODES, colourMode, slotLimit,
} from '../../printers.js';
import { MATERIAL_TYPES, pricePerKg, pricePerGram, materialType } from '../../materials.js';
import { itemPrice } from '../../packaging.js';
import {
  makeCustomer, makeId, makeAddressParts, formatAddress, ADDRESS_TYPES,
} from '../../projects.js';
import { state, saveSoon } from '../../state.js';

export const id = 'catalogues';
export const name = 'Catalogues';
export const short = 'Data';

const TABS = [
  { id: 'printers', name: 'Printers' },
  { id: 'materials', name: 'Materials' },
  { id: 'shipping', name: 'Shipping' },
  { id: 'packaging', name: 'Packaging' },
  { id: 'hardware', name: 'Hardware' },
  { id: 'customers', name: 'Customers' },
];

const touch = (rerender) => { saveSoon(); rerender(); };

/**
 * The standard action row every catalogue editor carries.
 *
 * Editing itself is inline - fields save as they are typed - so there is no
 * separate Save button to forget to press. What is worth having is a consistent
 * way to start a fresh entry, copy the one on screen, and archive it, laid out
 * the same on every catalogue so muscle memory carries across.
 */
function catalogueActions({ keyPrefix, selected, onNew, onDuplicate, onArchive, onDelete }) {
  return el('div', { class: 'catalogue-actions' }, [
    buttonRow([
      button('New', onNew, { key: `new-${keyPrefix}` }),
      button('Duplicate', onDuplicate, { key: `dup-${keyPrefix}` }),
      button(selected.archived ? 'Restore' : 'Archive', onArchive,
        { key: `arch-${keyPrefix}`, danger: !selected.archived }),
      onDelete ? button('Delete', onDelete, { key: `del-${keyPrefix}`, danger: true }) : null,
    ].filter(Boolean)),
    muted('Fields save as you type. Duplicate copies this entry to a new one; Archive hides it '
      + 'from new work without touching projects that already used it; Delete removes it for good '
      + '(only when nothing has used it).'),
  ]);
}

/**
 * Permanently remove a catalogue entry - the escape hatch for a mistake, where
 * Archive is the safe default. Three guards keep it from doing harm: it refuses
 * when a saved project has used the entry (deleting it would break or silently
 * reprice that work), it refuses to remove the last one (the estimator needs
 * one), and it records the id as removed so a shipped default is not re-added by
 * the upgrade-migration on the next load.
 */
function deleteEntry({
  collection, list, selected, selectKey, rerender, tombstone = true,
}) {
  if (!selected) return;
  const live = list.filter((x) => !x.archived);
  if (live.length <= 1 && !selected.archived) {
    toast('This is the only one left — add another before deleting this.');
    return;
  }
  // A blunt but safe check: if the id appears anywhere in the saved projects it
  // is in use, and Archive is the right tool, not Delete.
  if (JSON.stringify(state.projects).includes(`"${selected.id}"`)) {
    toast('A project has used this — archive it instead so that work is not broken.');
    return;
  }
  if (!window.confirm(`Delete “${selected.name}” for good? This cannot be undone. `
    + 'Archive instead if you only want to hide it from new work.')) return;

  const idx = list.findIndex((x) => x.id === selected.id);
  if (idx >= 0) list.splice(idx, 1);
  if (tombstone) {
    const removed = state.settings.removed || (state.settings.removed = {});
    removed[collection] = [...new Set([...(removed[collection] || []), selected.id])];
  }
  if (selectKey) state.ui[selectKey] = list.find((x) => !x.archived)?.id || list[0]?.id || null;
  touch(rerender);
  toast('Deleted');
}

/* ------------------------------------------------------------- printers -- */

function printersPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const ranked = byMachineHourCost(settings.printers.filter((p) => !p.archived));

  return [
    banner('info', 'The order below is a result, not a setting. Change a purchase price '
      + 'or a service life and the ranking moves — there is no "cheap machine" flag '
      + 'anywhere in this app.'),
    table([
      { label: 'Printer', get: (p) => p.name },
      { label: 'Capital', align: 'right', mono: true, get: (p) => `${fmtMoney(machineHourCost(p).depreciation, code)}/h` },
      { label: 'Maintenance', align: 'right', mono: true, get: (p) => `${fmtMoney(machineHourCost(p).maintenance, code)}/h` },
      { label: 'Parts', align: 'right', mono: true, get: (p) => `${fmtMoney(machineHourCost(p).parts, code)}/h` },
      { label: 'Overhead', align: 'right', mono: true, get: (p) => `${fmtMoney(machineHourCost(p).overhead, code)}/h` },
      { label: 'Machine hour', align: 'right', mono: true, get: (p) => `${fmtMoney(machineHourCost(p).total, code)}/h` },
      { label: 'Filament', get: (p) => pill(colourMode(p).name, colourMode(p).materialsVary ? 'ok' : (colourMode(p).coloursVary ? 'info' : 'warn')) },
      { label: 'Flow', align: 'right', mono: true, get: (p) => `${p.flowRate} mm³/s` },
      { label: 'Failure', align: 'right', mono: true, get: (p) => fmtRate(p.failureRate) },
      { label: '', get: (p) => (p.verified ? pill('checked', 'ok') : pill('starting value', 'warn')) },
    ], ranked),
    muted('Every specification shipped with this app is a starting value to be checked '
      + 'against the machine in front of you. Tick "I have checked this" once you have.'),
  ];
}

function printerEditor(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const selected = settings.printers.find((p) => p.id === state.ui.selectedPrinter)
    || settings.printers[0];
  if (!selected) return [];

  const set = (key) => (value) => { selected[key] = value; touch(rerender); };
  const setBuild = (axis) => (value) => {
    selected.build = { ...selected.build, [axis]: Math.max(1, num(value, 1)) };
    touch(rerender);
  };
  const rate = machineHourCost(selected);

  return [
    selectField('printer-pick', 'Printer',
      settings.printers.map((p) => ({ value: p.id, label: p.name + (p.archived ? ' (archived)' : '') })),
      selected.id, (v) => { state.ui.selectedPrinter = v; touch(rerender); }),

    section('printer-economics', 'Machine economics', [
      muted('The machine-hour cost falls out of these six numbers. Nothing else decides it.'),
      moneyField('purchase-price', 'Purchase price', selected.purchasePrice, set('purchasePrice'), code),
      moneyField('residual', 'Residual value at end of life', selected.residualValue, set('residualValue'), code),
      el('div', { class: 'field-grid' }, [
        numberField('service-life', 'Service life', selected.serviceLifeYears,
          (v) => set('serviceLifeYears')(Math.max(0.5, num(v, 1))), { min: 0.5, step: 0.5, suffix: 'years' }),
        numberField('hours-per-year', 'Hours run per year', selected.hoursPerYear,
          (v) => set('hoursPerYear')(Math.max(1, num(v, 1))), { min: 1, step: 10, suffix: 'h' }),
      ]),
      numberField('payback-hours', 'Pay the machine off within', selected.paybackHoursOverride,
        (v) => set('paybackHoursOverride')(v == null ? null : Math.max(1, num(v))), {
          min: 1, step: 50, suffix: 'h',
          info: 'How quickly you want to earn the machine’s cost back through the price — a '
            + 'different question from how long it lasts. Recover the cost over these printing '
            + 'hours instead of the full expected life. A shorter payback raises the machine-hour '
            + 'cost and pays the printer off sooner; leave it empty to spread the cost over the '
            + 'whole life.',
          hint: selected.paybackHoursOverride
            ? `Its expected life is ${lifetimeHours(selected).toLocaleString()} h — you are `
              + `pricing to pay it off in ${paybackHours(selected).toLocaleString()} h.`
            : `Empty spreads the cost over the full expected life of ${lifetimeHours(selected).toLocaleString()} h.`,
        }),
      moneyField('maintenance', 'Maintenance per year', selected.maintenancePerYear, set('maintenancePerYear'), code),
      moneyField('replacement', 'Replacement parts per year', selected.replacementPartsPerYear, set('replacementPartsPerYear'), code),
      moneyField('overhead', 'Overhead per hour', selected.overheadPerHour, set('overheadPerHour'), code, {
        info: 'Rent, insurance and the share of running the workshop that this machine '
          + 'is responsible for.',
      }),
      el('div', { class: 'summary-grid' }, [
        statTile('Expected life', `${lifetimeHours(selected).toLocaleString()} h`),
        statTile('Paying off over', `${paybackHours(selected).toLocaleString()} h`, {
          hint: selected.paybackHoursOverride ? 'your chosen payback' : 'full life — no payback set',
        }),
        statTile('Machine hour', `${fmtMoney(rate.total, code)}/h`, { tone: 'accent' }),
        statTile('Capital recovery', `${fmtMoney(rate.depreciation, code)}/h`),
      ]),
    ]),

    section('printer-spec', 'Specification', [
      textField('printer-name', 'Name', selected.name, set('name')),
      textField('printer-make', 'Manufacturer', selected.make, set('make')),
      subsection('Build volume', [
        el('div', { class: 'field-grid' }, [
          numberField('build-x', 'X', selected.build.x, setBuild('x'), { min: 1, suffix: 'mm' }),
          numberField('build-y', 'Y', selected.build.y, setBuild('y'), { min: 1, suffix: 'mm' }),
          numberField('build-z', 'Z', selected.build.z, setBuild('z'), { min: 1, suffix: 'mm' }),
        ]),
      ]),
      numberField('flow-rate', 'Sustained volumetric flow', selected.flowRate,
        (v) => set('flowRate')(Math.max(0.1, num(v, 1))), {
          min: 0.1, step: 0.5, suffix: 'mm³/s',
          info: 'This bounds print time far more honestly than the headline mm/s, which '
            + 'no machine holds through a corner.',
        }),
      numberField('printer-speed', 'Headline speed', selected.speed, set('speed'), { min: 1, suffix: 'mm/s' }),
      subsection('What it can print at once', [
        selectField('colour-mode', 'Filament capability',
          COLOUR_MODES.map((m) => ({ value: m.id, label: m.name })),
          colourMode(selected).id, set('colourMode'), {
            hint: colourMode(selected).hint,
          }),
        colourMode(selected).id === 'single'
          ? muted('With one spool, a second colour means stopping the machine and '
            + 'swapping it by hand — which is why it costs labour rather than a purge.')
          : numberField('colour-slots', 'Spools loaded at once', selected.colourSlots,
            (v) => set('colourSlots')(Math.max(1, Math.round(num(v, 1)))), {
              min: 1, step: 1,
              hint: `This machine is set up to hold ${slotLimit(selected)}.`,
            }),
        numberField('max-colours', 'Colours in one model', selected.maxColours,
          (v) => set('maxColours')(Math.max(1, Math.round(num(v, 1)))), { min: 1, step: 1 }),
        // The machine's own change time: a hands-off swap the printer does
        // itself, so it is machine time and lives here, per printer - never in
        // the labour list. Only automatic machines have it; a manual swap is a
        // person, and that stays labour.
        ['multicolour', 'multimaterial'].includes(colourMode(selected).id)
          ? numberField('change-seconds', 'Automatic change time', selected.changeSeconds,
            (v) => set('changeSeconds')(Math.max(0, num(v))), {
              min: 0, step: 1, suffix: 's',
              info: 'How long this machine takes for one hands-off colour or tool change — '
                + 'roughly 6 s on a toolchanger, 25 s on an AMS-style purge. It is charged '
                + 'as machine time, not labour, because nobody is standing there.',
            })
          : null,
      ]),
      numberField('setup-minutes', 'Setup minutes per job', selected.setupMinutes, set('setupMinutes'), { min: 0 }),
      percentField('failure-rate', 'Recorded failure rate', selected.failureRate, set('failureRate')),
      subsection('Materials it can run', MATERIAL_TYPES.map((type) => checkField(
        `printer-mat-${type.id}`, type.name,
        selected.materials.includes(type.id),
        (checked) => {
          selected.materials = checked
            ? [...new Set([...selected.materials, type.id])]
            : selected.materials.filter((m) => m !== type.id);
          touch(rerender);
        },
      ))),
      checkField('printer-verified', 'I have checked these against the machine',
        selected.verified, set('verified'), {
          hint: 'Until this is ticked the app shows the specification as a starting value.',
        }),
    ], { open: false }),

    section('printer-power', 'Power', [
      numberField('power-w', 'Printing', selected.powerW, set('powerW'), { min: 0, suffix: 'W' }),
      numberField('heatup-w', 'Heating up', selected.heatupPowerW, set('heatupPowerW'), { min: 0, suffix: 'W' }),
      numberField('heatup-min', 'Heat-up time', selected.heatupMinutes, set('heatupMinutes'), { min: 0, suffix: 'min' }),
      numberField('idle-w', 'Idle', selected.idlePowerW, set('idlePowerW'), { min: 0, suffix: 'W' }),
      muted('Power is not part of the machine-hour rate. Electricity is charged on its '
        + 'own line, so it cannot be charged twice.'),
    ], { open: false }),

    catalogueActions({
      keyPrefix: 'printer',
      selected,
      onNew: () => {
        const item = { ...selected, id: makeId('printer'), name: 'New printer', verified: false, archived: false };
        settings.printers.push(item);
        state.ui.selectedPrinter = item.id;
        touch(rerender);
      },
      onDuplicate: () => {
        const copy = { ...selected, id: makeId('printer'), name: `${selected.name} (copy)`, verified: false, archived: false };
        settings.printers.push(copy);
        state.ui.selectedPrinter = copy.id;
        touch(rerender);
      },
      onArchive: () => { selected.archived = !selected.archived; touch(rerender); },
      onDelete: () => deleteEntry({
        collection: 'printers', list: settings.printers, selected, selectKey: 'selectedPrinter', rerender,
      }),
    }),
  ];
}

/* ------------------------------------------------------------ materials -- */

function materialsPanel(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const country = settings.countryId;
  const live = settings.materials.filter((m) => !m.archived);

  const chosen = new Set(state.ui.materialSelection || []);
  const setChosen = () => { state.ui.materialSelection = [...chosen]; touch(rerender); };
  const toggle = (id) => { if (chosen.has(id)) chosen.delete(id); else chosen.add(id); setChosen(); };
  const selectType = (typeId) => { for (const m of live) if (m.type === typeId) chosen.add(m.id); setChosen(); };

  const typesPresent = MATERIAL_TYPES.filter((t) => live.some((m) => m.type === t.id));

  return [
    banner('info', `Prices are per country and are not interchangeable. These are the `
      + `${country} prices; a spool costs what it costs where you buy it, and there is no `
      + 'exchange rate anywhere in this app.'),
    subsection('Mass price update', [
      muted('Tick materials below, or select a whole type, then set one spool price for all '
        + `of them in ${country}. A material with its own override still wins.`),
      buttonRow([
        ...typesPresent.map((t) => button(`All ${t.name}`, () => selectType(t.id),
          { key: `masssel-${t.id}` })),
        chosen.size ? button('Clear', () => { state.ui.materialSelection = []; touch(rerender); },
          { key: 'masssel-clear' }) : null,
      ].filter(Boolean)),
      el('div', { class: 'field-grid' }, [
        numberField('mass-price', `Spool price (${code})`, state.ui.massPrice ?? '',
          (v) => { state.ui.massPrice = num(v); touch(rerender); }, { min: 0, step: 0.01 }),
        button(`Apply to ${chosen.size} selected`, () => {
          const p = Math.max(0, num(state.ui.massPrice));
          for (const m of live) {
            if (chosen.has(m.id)) m.prices = { ...(m.prices || {}), [country]: p };
          }
          toast(`Set ${chosen.size} spool price${chosen.size === 1 ? '' : 's'} to `
            + `${fmtMoney(p, code)}`);
          touch(rerender);
        }, { primary: true, key: 'mass-apply', disabled: chosen.size === 0 }),
      ]),
    ], { open: chosen.size > 0 }),
    table([
      {
        label: '',
        get: (m) => checkField(`msel-${m.id}`, '', chosen.has(m.id), () => toggle(m.id)),
      },
      { label: 'Material', get: (m) => `${m.name} · ${m.colour}` },
      { label: 'Type', get: (m) => materialType(m.type).name },
      { label: 'Density', align: 'right', mono: true, get: (m) => `${materialType(m.type).density} g/cm³` },
      { label: 'Spool', align: 'right', mono: true, get: (m) => `${m.spoolWeight} g` },
      {
        label: 'Per kg',
        align: 'right',
        mono: true,
        get: (m) => (pricePerKg(m, country) == null ? '—' : fmtMoney(pricePerKg(m, country), code)),
      },
      {
        label: 'Per gram',
        align: 'right',
        mono: true,
        get: (m) => (pricePerGram(m, country) == null ? '—' : fmtMoney(pricePerGram(m, country), code)),
      },
      { label: 'Waste', align: 'right', mono: true, get: (m) => fmtRate(m.wasteFactor) },
      {
        label: '',
        get: (m) => (pricePerGram(m, country) == null
          ? pill(`no ${country} price`, 'danger')
          : (m.priceOverride != null ? pill('overridden', 'warn') : '')),
      },
    ], live),
  ];
}

function materialEditor(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const selected = settings.materials.find((m) => m.id === state.ui.selectedMaterial)
    || settings.materials[0];
  if (!selected) return [];

  const set = (key) => (value) => { selected[key] = value; touch(rerender); };
  const type = materialType(selected.type);

  return [
    selectField('material-pick', 'Material',
      settings.materials.map((m) => ({ value: m.id, label: `${m.name} · ${m.colour}` })),
      selected.id, (v) => { state.ui.selectedMaterial = v; touch(rerender); }),

    section('material-detail', 'Material', [
      textField('material-name', 'Name', selected.name, set('name')),
      textField('material-colour', 'Colour', selected.colour, set('colour')),
      textField('material-manufacturer', 'Manufacturer', selected.manufacturer, set('manufacturer')),
      selectField('material-type', 'Type',
        MATERIAL_TYPES.map((t) => ({ value: t.id, label: t.name })),
        selected.type, set('type'), { hint: `${type.density} g/cm³, bed ${type.bed} °C, nozzle ${type.nozzle} °C`
          + `${type.enclosure ? ', needs an enclosure' : ''}${type.abrasive ? ', abrasive' : ''}` }),
      el('div', { class: 'field-grid' }, [
        numberField('material-diameter', 'Diameter', selected.diameter, set('diameter'), { min: 0.5, step: 0.05, suffix: 'mm' }),
        numberField('material-spool', 'Spool weight', selected.spoolWeight,
          (v) => set('spoolWeight')(Math.max(1, num(v, 1))), { min: 1, step: 50, suffix: 'g' }),
      ]),
      percentField('material-waste', 'Waste factor', selected.wasteFactor, set('wasteFactor'), {
        info: 'Priming, purging and the last few metres nobody can print.',
      }),
      textField('material-storage', 'Storage', selected.storage, set('storage'), { multiline: true, rows: 2 }),
    ]),

    section('material-prices', 'Price per country', [
      muted('One spool, in each country’s own currency.'),
      ...settings.countries.map((c) => numberField(
        `material-price-${c.id}`,
        `${c.name} (${c.currency})`,
        selected.prices?.[c.id] ?? '',
        (v) => {
          selected.prices = { ...(selected.prices || {}) };
          if (v == null) delete selected.prices[c.id];
          else selected.prices[c.id] = num(v);
          touch(rerender);
        },
        { min: 0, step: 0.01 },
      )),
      numberField('material-override', 'Override for this workshop',
        selected.priceOverride ?? '', (v) => { selected.priceOverride = v; touch(rerender); },
        { min: 0, step: 0.01, suffix: code, hint: 'Beats the catalogue price. Leave empty to use it.' }),
      el('div', { class: 'summary-grid' }, [
        statTile('Per kg', pricePerKg(selected, settings.countryId) == null ? '—'
          : fmtMoney(pricePerKg(selected, settings.countryId), code)),
        statTile('Per gram', pricePerGram(selected, settings.countryId) == null ? '—'
          : fmtMoney(pricePerGram(selected, settings.countryId), code)),
      ]),
    ]),

    catalogueActions({
      keyPrefix: 'material',
      selected,
      onNew: () => {
        const item = { ...selected, id: makeId('mat'), name: 'New material', archived: false };
        settings.materials.push(item);
        state.ui.selectedMaterial = item.id;
        touch(rerender);
      },
      onDuplicate: () => {
        const copy = { ...selected, id: makeId('mat'), name: `${selected.name} (copy)`, archived: false };
        settings.materials.push(copy);
        state.ui.selectedMaterial = copy.id;
        touch(rerender);
      },
      onArchive: () => { selected.archived = !selected.archived; touch(rerender); },
      onDelete: () => deleteEntry({
        collection: 'materials', list: settings.materials, selected, selectKey: 'selectedMaterial', rerender,
      }),
    }),
  ];
}

/* ------------------------------------------------- shipping and packing -- */

function listEditor(ctx, {
  collection, label, columns, fields, blank, selectedKey,
}) {
  const { rerender } = ctx;
  const settings = state.settings;
  const list = settings[collection];
  const selected = list.find((x) => x.id === state.ui[selectedKey]) || list[0];

  const panel = [
    table(columns, list.filter((x) => !x.archived)),
  ];

  const add = (item) => {
    const created = { ...item, id: makeId(collection), archived: false };
    list.push(created);
    state.ui[selectedKey] = created.id;
    touch(rerender);
  };

  const editor = selected
    ? [section(`${collection}-editor`, label, [
      selectField(`${collection}-pick`, label,
        list.map((x) => ({ value: x.id, label: x.name })),
        selected.id, (v) => { state.ui[selectedKey] = v; touch(rerender); }),
      ...fields(selected, (key) => (value) => { selected[key] = value; touch(rerender); }),
      catalogueActions({
        keyPrefix: collection,
        selected,
        onNew: () => add({ ...blank(selected), name: `New ${label.toLowerCase()}` }),
        onDuplicate: () => add(blank(selected)),
        onArchive: () => { selected.archived = !selected.archived; touch(rerender); },
        onDelete: () => deleteEntry({
          collection, list, selected, selectKey, rerender,
        }),
      }),
    ], { open: true })]
    : [section(`${collection}-editor`, label, [muted('Nothing in this catalogue yet.')], { open: true })];

  return { panel, editor };
}

function shippingParts(ctx) {
  const settings = state.settings;
  const code = settings.currencyCode;
  return listEditor(ctx, {
    collection: 'shipping',
    label: 'Method',
    selectedKey: 'selectedShipping',
    columns: [
      { label: 'Method', get: (m) => m.name },
      { label: 'Carrier', get: (m) => m.carrier },
      { label: 'Country', get: (m) => (m.country === '*' ? 'Any' : m.country) },
      { label: 'Price', align: 'right', mono: true, get: (m) => fmtMoney(m.basePrice, code) },
      { label: 'Max size', align: 'right', mono: true, get: (m) => m.maxDims.join(' × ') },
      { label: 'Max weight', align: 'right', mono: true, get: (m) => `${(m.maxWeightG / 1000).toFixed(1)} kg` },
      { label: 'Days', align: 'right', mono: true, get: (m) => String(m.days) },
      { label: '', get: (m) => (m.qualifiesForFree ? '' : pill('never free', 'warn')) },
    ],
    blank: (from) => ({ ...from, name: `${from.name} (copy)` }),
    fields: (m, set) => [
      textField('ship-name', 'Name', m.name, set('name')),
      textField('ship-carrier', 'Carrier', m.carrier, set('carrier')),
      selectField('ship-country', 'Country',
        [{ value: '*', label: 'Any country' },
          ...settings.countries.map((c) => ({ value: c.id, label: c.name }))],
        m.country, set('country')),
      moneyField('ship-price', 'Base price', m.basePrice, set('basePrice'), code),
      numberField('ship-days', 'Delivery days', m.days, set('days'), { min: 0, step: 1 }),
      subsection('Limits', [
        el('div', { class: 'field-grid' }, [0, 1, 2].map((i) => numberField(
          `ship-dim-${i}`, `Max ${['length', 'width', 'depth'][i]}`, m.maxDims[i],
          (v) => { m.maxDims[i] = Math.max(0, num(v)); set('maxDims')(m.maxDims); },
          { min: 0, suffix: 'mm' },
        ))),
        numberField('ship-weight', 'Max weight', m.maxWeightG / 1000,
          (v) => set('maxWeightG')(Math.max(0, num(v) * 1000)), { min: 0, step: 0.5, suffix: 'kg' }),
      ]),
      moneyField('ship-insurance', 'Insurance', m.insurance, set('insurance'), code),
      moneyField('ship-surcharge', 'Surcharge', m.surcharge, set('surcharge'), code),
      checkField('ship-free', 'Counts towards free shipping', m.qualifiesForFree, set('qualifiesForFree')),
    ],
  });
}

function packagingParts(ctx) {
  const settings = state.settings;
  const code = settings.currencyCode;
  return listEditor(ctx, {
    collection: 'packaging',
    label: 'Item',
    selectedKey: 'selectedPackaging',
    columns: [
      { label: 'Item', get: (p) => p.name },
      { label: 'Kind', get: (p) => p.kind },
      { label: 'Inside', align: 'right', mono: true, get: (p) => (p.inner ? p.inner.join(' × ') : '—') },
      { label: 'Weight', align: 'right', mono: true, get: (p) => `${p.weightG} g` },
      { label: 'Cost', align: 'right', mono: true, get: (p) => fmtMoney(itemPrice(p, settings.countryId), code) },
    ],
    blank: (from) => ({ ...from, name: `${from.name} (copy)` }),
    fields: (p, set) => [
      textField('pack-name', 'Name', p.name, set('name')),
      selectField('pack-kind', 'Kind', [
        { value: 'container', label: 'Container — one is chosen per order' },
        { value: 'consumable', label: 'Consumable — added to every order' },
      ], p.kind, set('kind')),
      p.kind === 'container' ? subsection('Usable inside size', [
        el('div', { class: 'field-grid' }, [0, 1, 2].map((i) => numberField(
          `pack-inner-${i}`, ['Length', 'Width', 'Depth'][i], p.inner?.[i] ?? 0,
          (v) => {
            p.inner = [...(p.inner || [0, 0, 0])];
            p.inner[i] = Math.max(0, num(v));
            set('inner')(p.inner);
          }, { min: 0, suffix: 'mm' },
        ))),
      ]) : null,
      numberField('pack-weight', 'Weight', p.weightG, set('weightG'), { min: 0, suffix: 'g' }),
      ...settings.countries.map((c) => numberField(
        `pack-price-${c.id}`, `${c.name} (${c.currency})`, p.prices?.[c.id] ?? '',
        (v) => { p.prices = { ...(p.prices || {}), [c.id]: num(v) }; set('prices')(p.prices); },
        { min: 0, step: 0.01 },
      )),
      textField('pack-supplier', 'Supplier', p.supplier || '', set('supplier')),
    ],
  });
}

function hardwareParts(ctx) {
  const settings = state.settings;
  const code = settings.currencyCode;
  return listEditor(ctx, {
    collection: 'hardware',
    label: 'Component',
    selectedKey: 'selectedHardware',
    columns: [
      { label: 'Component', get: (h) => h.name },
      { label: 'Part no.', mono: true, get: (h) => h.partNumber || '—' },
      { label: 'Category', get: (h) => h.category },
      { label: 'Cost', align: 'right', mono: true, get: (h) => fmtMoney(itemPrice(h, settings.countryId), code) },
      { label: 'Pause', align: 'right', mono: true, get: (h) => `${h.pauseMinutes} min` },
      { label: 'Fitting', align: 'right', mono: true, get: (h) => `${h.insertMinutes} min` },
      { label: 'Risk', align: 'right', mono: true, get: (h) => fmtRate(h.failureRisk) },
    ],
    blank: (from) => ({ ...from, name: `${from.name} (copy)`, partNumber: '' }),
    fields: (h, set) => [
      textField('hw-name', 'Name', h.name, set('name')),
      textField('hw-partno', 'Part number', h.partNumber || '', set('partNumber'), {
        hint: 'Your internal logistics reference for this component — the app links to your '
          + 'system through it, so the supplier and their SKU stay where you already keep them.',
      }),
      textField('hw-category', 'Category', h.category, set('category')),
      ...settings.countries.map((c) => numberField(
        `hw-price-${c.id}`, `${c.name} (${c.currency})`, h.prices?.[c.id] ?? '',
        (v) => { h.prices = { ...(h.prices || {}), [c.id]: num(v) }; set('prices')(h.prices); },
        { min: 0, step: 0.01 },
      )),
      numberField('hw-pause', 'Pause the print', h.pauseMinutes, set('pauseMinutes'), { min: 0, suffix: 'min' }),
      numberField('hw-insert', 'Fitting time', h.insertMinutes, set('insertMinutes'), { min: 0, suffix: 'min' }),
      numberField('hw-material', 'Extra material', h.extraMaterialG, set('extraMaterialG'), { min: 0, suffix: 'g' }),
      percentField('hw-risk', 'Chance fitting ruins the part', h.failureRisk, set('failureRisk')),
      checkField('hw-nfc', 'This is an NFC tag', !!h.nfc, set('nfc'), {
        hint: 'Adds the NFC-coding step to post-processing on any part this is embedded in. '
          + 'Set the coding time in Settings → Labour → Post-processing.',
      }),
      textField('hw-note', 'Operator note', h.note || '', set('note'), { multiline: true, rows: 2 }),
    ],
  });
}

/* ------------------------------------------------------------ customers -- */

/**
 * The structured address editor. Every field writes into `addressParts` and
 * recomposes the one-string `address` that quotes and invoices actually print,
 * so the two never drift. A customer imported from the portal arrives with both
 * already filled in.
 */
function customerAddress(selected, rerender) {
  if (!selected.addressParts) selected.addressParts = makeAddressParts();
  const a = selected.addressParts;
  const recompose = () => { selected.address = formatAddress(a); };
  const set = (key) => (v) => { a[key] = v; recompose(); touch(rerender); };

  return subsection('Delivery address', [
    selectField('customer-addr-type', 'Address type',
      ADDRESS_TYPES.map((t) => ({ value: t.id, label: t.name })),
      a.type, (v) => { a.type = v; recompose(); touch(rerender); }),
    a.type === 'complex'
      ? el('div', { class: 'field-grid' }, [
        textField('customer-addr-unit', 'Unit / door number', a.unit, set('unit')),
        textField('customer-addr-complex', 'Complex / estate name', a.complex, set('complex')),
      ])
      : null,
    a.type === 'business'
      ? textField('customer-addr-business', 'Business name', a.business, set('business'))
      : null,
    textField('customer-addr-street', 'Street number and name', a.street, set('street')),
    el('div', { class: 'field-grid' }, [
      textField('customer-addr-area', 'Suburb / area', a.area, set('area')),
      textField('customer-addr-city', 'City / town', a.city, set('city')),
    ]),
    el('div', { class: 'field-grid' }, [
      textField('customer-addr-province', 'Province', a.province, set('province')),
      textField('customer-addr-postal', 'Postal code', a.postalCode, set('postalCode')),
    ]),
    textField('customer-addr-country', 'Country', a.country, set('country')),
    selected.address
      ? muted(`On documents: ${selected.address.replace(/\n/g, ', ')}`)
      : null,
  ].filter(Boolean), { hint: 'Fills the address that appears on quotes and invoices.' });
}

function customersParts(ctx) {
  const { rerender } = ctx;
  const customers = state.customers;
  const selected = customers.find((c) => c.id === state.ui.selectedCustomer) || customers[0];

  const panel = customers.length
    ? [table([
      { label: 'Customer', get: (c) => c.name },
      { label: 'Email', get: (c) => c.email || '—' },
      { label: 'VAT', get: (c) => c.vatNumber || '—' },
      { label: 'Standing discount', get: (c) => (c.discount?.kind === 'none' ? '—' : c.discount?.kind) },
      { label: 'Projects', align: 'right', mono: true, get: (c) => String(state.projects.filter((p) => p.customerId === c.id).length) },
    ], customers.filter((c) => !c.archived))]
    : [emptyState('No customers yet.')];

  const addCustomer = (spec) => {
    const customer = makeCustomer(spec);
    state.customers.push(customer);
    state.ui.selectedCustomer = customer.id;
    touch(rerender);
  };

  const editor = selected ? [section('customer-editor', 'Customer', [
    selectField('customer-pick', 'Customer',
      customers.map((c) => ({ value: c.id, label: c.name })),
      selected.id, (v) => { state.ui.selectedCustomer = v; touch(rerender); }),
    textField('customer-name', 'Name', selected.name, (v) => { selected.name = v; touch(rerender); }),
    textField('customer-email', 'Email', selected.email, (v) => { selected.email = v; touch(rerender); }),
    textField('customer-phone', 'Phone', selected.phone, (v) => { selected.phone = v; touch(rerender); }),
    customerAddress(selected, rerender),
    textField('customer-vat', 'VAT number', selected.vatNumber, (v) => { selected.vatNumber = v; touch(rerender); }),
    subsection('Standing discount', [
      selectField('customer-discount', 'Discount', [
        { value: 'none', label: 'None' },
        { value: 'percent', label: 'Percentage off' },
        { value: 'volume', label: 'Quantity tiers' },
      ], selected.discount?.kind || 'none', (v) => {
        selected.discount = { ...(selected.discount || {}), kind: v };
        touch(rerender);
      }),
      selected.discount?.kind === 'percent'
        ? numberField('customer-discount-pct', 'Percentage', selected.discount.percent ?? 0,
          (v) => { selected.discount.percent = num(v); touch(rerender); }, { min: 0, max: 95, suffix: '%' })
        : null,
    ]),
    textField('customer-notes', 'Notes', selected.notes, (v) => { selected.notes = v; touch(rerender); }, { multiline: true }),
    catalogueActions({
      keyPrefix: 'customer',
      selected,
      onNew: () => addCustomer(),
      onDuplicate: () => {
        const { id, ...rest } = selected;
        addCustomer({ ...rest, name: `${selected.name} (copy)` });
      },
      onArchive: () => { selected.archived = !selected.archived; touch(rerender); },
      onDelete: () => deleteEntry({
        collection: 'customers', list: state.customers, selected, selectKey: 'selectedCustomer', rerender,
        tombstone: false,
      }),
    }),
  ], { open: true })] : [buttonRow([button('Add a customer', () => {
    const customer = makeCustomer();
    state.customers.push(customer);
    state.ui.selectedCustomer = customer.id;
    touch(rerender);
  }, { primary: true, key: 'add-customer' })])];

  return { panel, editor };
}

/* ----------------------------------------------------------------- tool -- */

function parts(ctx) {
  switch (state.ui.catalogue) {
    case 'materials': return { panel: materialsPanel(ctx), editor: materialEditor(ctx) };
    case 'shipping': return shippingParts(ctx);
    case 'packaging': return packagingParts(ctx);
    case 'hardware': return hardwareParts(ctx);
    case 'customers': return customersParts(ctx);
    case 'printers':
    default: return { panel: printersPanel(ctx), editor: printerEditor(ctx) };
  }
}

export function sidebar(ctx) {
  return parts(ctx).editor;
}

export function main(ctx) {
  const { rerender } = ctx;
  return [
    chips('catalogue-tab', TABS.map((t) => ({ value: t.id, label: t.name })),
      state.ui.catalogue, (value) => { state.ui.catalogue = value; touch(rerender); }),
    ...parts(ctx).panel,
  ];
}
