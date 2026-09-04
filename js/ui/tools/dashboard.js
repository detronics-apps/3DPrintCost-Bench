/**
 * The business dashboard, and the estimate-versus-actual learning loop.
 *
 * Where there is not enough data, the answer here is "not enough data yet"
 * rather than a confident zero. A margin of 0% and a margin nobody has measured
 * are different facts and they must not look the same.
 */

import { el } from '../dom.js';
import {
  section, selectField, textField, numberField, checkField, button, buttonRow,
  table, muted, statTile, pill, banner, emptyState, chips, percentField,
} from '../controls.js';
import { svg } from '../dom.js';
import { fmtMoney, fmtRate, num } from '../../money.js';
import { dashboard as buildDashboard, committedLoad, revenueByMonth } from '../../analytics.js';
import { calibrate, samplesFrom, errorReport, correctionFor, CALIBRATION_SCOPES, DEFAULT_CALIBRATION } from '../../calibration.js';
import { demandMultiplier, utilisation, CAPACITY_SOURCES } from '../../demand.js';
import { downloadCsv } from '../export.js';
import { returnsOnMachines, surplusPool } from '../../roi.js';
import { state, saveSoon } from '../../state.js';

export const id = 'dashboard';
export const name = 'Dashboard';
export const short = 'Board';

const touch = (rerender) => { saveSoon(); rerender(); };

/** A sparkline. Values are scaled to their own range, padded relatively. */
function sparkline(buckets, pick, { width = 520, height = 90, colour = 'var(--accent-strong)' } = {}) {
  const values = buckets.map(pick);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  // A relative guard: an absolute epsilon is a claim about units (pitfalls #11).
  const magnitude = Math.max(Math.abs(min), Math.abs(max), Number.MIN_VALUE);
  const span = Math.abs(max - min) <= magnitude * 1e-12 ? magnitude || 1 : max - min;

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Revenue by month' });
  const left = 8;
  const right = width - 8;
  const top = 12;
  const bottom = height - 20;
  const step = buckets.length > 1 ? (right - left) / (buckets.length - 1) : 0;
  const barWidth = Math.max(4, step * 0.6);

  buckets.forEach((bucket, i) => {
    const value = pick(bucket);
    const h = span > 0 ? ((value - min) / span) * (bottom - top) : 0;
    const x = left + i * step - barWidth / 2;
    root.appendChild(svg('rect', {
      x: Math.max(left, x), y: bottom - h, width: barWidth, height: Math.max(1, h), rx: 2, fill: colour,
    }));
    root.appendChild(svg('text', {
      x: left + i * step, y: height - 6, 'font-size': 9, 'text-anchor': 'middle',
      fill: 'var(--text-faint)', 'font-family': 'inherit',
    }, [bucket.label]));
  });

  return root;
}

export function main(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const code = settings.currencyCode;
  const filter = state.ui.filter || {};
  const d = buildDashboard({ projects: state.projects, settings, filter });

  if (!state.projects.length) {
    return [emptyState('Nothing to report yet. Save an estimate as a project and record a '
      + 'print, and this fills in.')];
  }

  const load = committedLoad(state.projects, settings);
  const months = revenueByMonth(state.projects, 12);
  const samples = samplesFrom(state.projects);
  const corrections = calibrate(samples, settings.calibration || DEFAULT_CALIBRATION);
  const errors = errorReport(samples);

  const nodes = [
    el('div', { class: 'summary-grid' }, [
      statTile('Active projects', String(d.counts.active), { hint: `${d.counts.projects} in total` }),
      statTile('Open quotes', String(d.counts.openQuotes)),
      statTile('Revenue', fmtMoney(d.money.revenue, code)),
      statTile('Cost to Company', fmtMoney(d.money.costToCompany, code)),
      statTile('Profit', fmtMoney(d.money.profit, code), { tone: d.money.profit >= 0 ? 'ok' : 'danger' }),
      statTile('Margin', d.money.margin == null ? 'not enough data' : fmtRate(d.money.margin)),
      statTile('Outstanding', fmtMoney(d.money.owed, code), { tone: d.money.owed ? 'warn' : null }),
      statTile('Overdue', String(d.counts.overdue), { tone: d.counts.overdue ? 'danger' : null }),
    ]),
  ];

  if (d.counts.overdue) {
    nodes.push(banner('warn', `${d.counts.overdue} invoice${d.counts.overdue === 1 ? ' is' : 's are'} `
      + `overdue, worth ${fmtMoney(d.money.overdue, code)}.`));
  }

  nodes.push(el('div', { class: 'viewport__stage' }, [sparkline(months, (b) => b.revenue)]));

  nodes.push(el('div', { class: 'summary-grid' }, [
    statTile('Printed', String(d.production.printed)),
    statTile('Accepted', String(d.production.accepted)),
    statTile('Rejection rate', d.production.rejectionRate == null
      ? 'not enough data' : fmtRate(d.production.rejectionRate),
    { tone: d.production.rejectionRate > 0.15 ? 'warn' : null }),
    statTile('Machine hours', d.production.machineHours.toFixed(1)),
    statTile('Filament used', `${d.production.kgUsed.toFixed(2)} kg`),
    statTile('Cost per accepted', d.production.costPerAccepted == null
      ? 'not enough data' : fmtMoney(d.production.costPerAccepted, code)),
    statTile('Quote conversion', d.conversion == null ? 'not enough data' : fmtRate(d.conversion)),
    statTile('Committed load', `${load.machineHours.toFixed(1)} h`,
      { hint: `${load.jobs} part${load.jobs === 1 ? '' : 's'} outstanding` }),
  ]));

  /* --- capacity and demand ------------------------------------------- */

  const demand = demandMultiplier(settings.demand);
  nodes.push(el('div', { class: 'panel' }, [
    el('div', { class: 'panel__head' }, [
      el('h3', { text: 'Capacity and demand' }),
      button('Take the committed hours from these projects', () => {
        settings.demand.committedMachineHours = Number(load.machineHours.toFixed(1));
        settings.demand.committedLabourHours = Number(load.labourHours.toFixed(1));
        touch(rerender);
      }, { key: 'sync-load' }),
    ]),
    el('div', { class: 'summary-grid' }, [
      statTile('Utilisation', settings.demand.mode === 'capacity'
        ? fmtRate(utilisation(settings.demand)) : 'demand set by hand'),
      statTile('Demand multiplier', `${demand.multiplier.toFixed(2)}×`, { tone: 'accent' }),
      statTile('Free capacity', `${Math.max(0, num(settings.demand.availableMachineHoursPerWeek)
        - num(settings.demand.committedMachineHours)).toFixed(1)} h`),
    ]),
    muted(demand.reason + ' Demand moves the price and never the cost.'),
  ]));

  /* --- printers and materials ---------------------------------------- */

  if (d.byPrinter.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'By printer' }),
      table([
        { label: 'Printer', key: 'name' },
        { label: 'Prints', align: 'right', mono: true, get: (r) => String(r.attempts) },
        { label: 'Accepted', align: 'right', mono: true, get: (r) => String(r.accepted) },
        { label: 'Rejection', align: 'right', mono: true, get: (r) => (r.rejectionRate == null ? '—' : fmtRate(r.rejectionRate)) },
        { label: 'Failures', align: 'right', mono: true, get: (r) => (r.failureRate == null ? '—' : fmtRate(r.failureRate)) },
        { label: 'Hours', align: 'right', mono: true, get: (r) => (r.minutes / 60).toFixed(1) },
        { label: 'Cost of that time', align: 'right', mono: true, get: (r) => (r.costOfTime == null ? '—' : fmtMoney(r.costOfTime, code)) },
      ], d.byPrinter),
    ]));
  }

  if (d.byMaterial.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'By material' }),
      table([
        { label: 'Material', key: 'name' },
        { label: 'Prints', align: 'right', mono: true, get: (r) => String(r.attempts) },
        { label: 'Used', align: 'right', mono: true, get: (r) => `${(r.grams / 1000).toFixed(2)} kg` },
        { label: 'Rejection', align: 'right', mono: true, get: (r) => (r.rejectionRate == null ? '—' : fmtRate(r.rejectionRate)) },
      ], d.byMaterial),
    ]));
  }

  if (d.mostProfitable.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'Most profitable parts' }),
      table([
        { label: 'Part', get: (r) => r.part.name },
        { label: 'Project', get: (r) => r.project.name },
        { label: 'Accepted', align: 'right', mono: true, get: (r) => String(r.stats.accepted) },
        { label: 'Cost each', align: 'right', mono: true, get: (r) => (r.costPerAccepted == null ? '—' : fmtMoney(r.costPerAccepted, code)) },
        { label: 'Price each', align: 'right', mono: true, get: (r) => (r.unitPrice == null ? '—' : fmtMoney(r.unitPrice, code)) },
        { label: 'Profit each', align: 'right', mono: true, get: (r) => (r.profitPerAccepted == null ? '—' : fmtMoney(r.profitPerAccepted, code)) },
      ], d.mostProfitable),
    ]));
  }

  if (d.mostRejected.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('h3', { text: 'Most often rejected' }),
      table([
        { label: 'Part', get: (r) => r.part.name },
        { label: 'Printed', align: 'right', mono: true, get: (r) => String(r.stats.printed) },
        { label: 'Rejected', align: 'right', mono: true, get: (r) => String(r.stats.rejected) },
        { label: 'Rate', align: 'right', mono: true, get: (r) => fmtRate(r.rejectionRate) },
      ], d.mostRejected),
    ]));
  }

  /* --- has the machine paid for itself? --------------------------------- */

  const invoices = state.projects.flatMap((p) => p.invoices || []);
  const roi = returnsOnMachines({ printers: settings.printers, projects: state.projects, invoices });
  const pool = surplusPool(roi);

  nodes.push(el('div', { class: 'panel' }, [
    el('h3', { text: 'Has the machine paid for itself?' }),
    muted('A printer is credited only with money that was charged FOR THE MACHINE — '
      + 'the depreciation, maintenance and parts in its hourly rate, plus its share '
      + 'of the profit its work earned. Not the plastic, not the labour, not the '
      + 'shipping: none of that money was ever going to buy a printer.'),
    table([
      { label: 'Printer', get: (r) => r.name },
      { label: 'To earn back', align: 'right', mono: true, get: (r) => fmtMoney(r.spent.total, code) },
      { label: 'Earned', align: 'right', mono: true, get: (r) => fmtMoney(r.earned, code) },
      {
        label: 'Progress',
        get: (r) => (r.percent == null ? muted('nothing to pay back') : roiBar(r)),
      },
      {
        label: 'Hours run',
        align: 'right',
        mono: true,
        get: (r) => `${r.hours.toFixed(0)} of ${r.lifetimeHours.toLocaleString()}`,
      },
      {
        label: '',
        get: (r) => {
          if (r.percent == null) return '';
          if (r.paidOff) return pill(`+${fmtMoney(r.surplus, code)} beyond`, 'ok');
          if (r.hoursToBreakEven == null) return pill('no history yet', 'info');
          return pill(`${Math.ceil(r.hoursToBreakEven)} h to go`, 'warn');
        },
      },
    ], roi),
    pool.paidOff > 0
      ? banner('ok', `${pool.paidOff} machine${pool.paidOff === 1 ? ' has' : 's have'} paid for `
        + `${pool.paidOff === 1 ? 'itself' : 'themselves'}, and ${fmtMoney(pool.total, code)} `
        + 'has been earned beyond what they cost. That is what buys the next one.')
      : muted('Nothing has paid for itself yet. Record production against each printer '
        + 'and this fills in from what the machines actually ran.'),
  ]));

  /* --- the learning loop ---------------------------------------------- */

  nodes.push(el('div', { class: 'panel' }, [
    el('h3', { text: 'Estimate, slicer, actual' }),
    muted('The app compares what it predicted with what the slicer said and what the '
      + 'machine did. Once there is enough evidence it corrects itself — and it never '
      + 'rewrites a quote that has already been issued.'),
    errors.appTime || errors.appMaterial ? el('div', { class: 'summary-grid' }, [
      statTile('App time error', errors.appTime ? fmtRate(errors.appTime.median) : 'not enough data',
        { hint: errors.appTime ? `${errors.appTime.n} prints` : null }),
      statTile('App material error', errors.appMaterial ? fmtRate(errors.appMaterial.median) : 'not enough data',
        { hint: errors.appMaterial ? `${errors.appMaterial.n} prints` : null }),
      statTile('Slicer time error', errors.slicerTime ? fmtRate(errors.slicerTime.median) : 'no slicer data'),
      statTile('Slicer material error', errors.slicerMaterial ? fmtRate(errors.slicerMaterial.median) : 'no slicer data'),
    ]) : muted('No finished prints with an estimate recorded against them yet.'),

    corrections.length ? table([
      { label: 'Scope', get: (c) => c.key },
      { label: 'Prints', align: 'right', mono: true, get: (c) => String(c.samples) },
      { label: 'Time correction', align: 'right', mono: true, get: (c) => `${c.timeCorrection.toFixed(3)}×` },
      { label: 'Material correction', align: 'right', mono: true, get: (c) => `${c.materialCorrection.toFixed(3)}×` },
      { label: 'Rejection', align: 'right', mono: true, get: (c) => (c.rejectionRate == null ? '—' : fmtRate(c.rejectionRate)) },
      { label: '', get: (c) => (c.applied ? pill('in use', 'ok') : pill('not enough evidence', 'warn')) },
    ], corrections) : null,

    corrections.some((c) => c.applied) ? null
      : muted(`A correction needs ${num(settings.calibration?.minimumSamples, 5)} finished prints `
        + 'in a scope before it is applied. Until then the app uses its own geometry unchanged.'),
  ]));

  return nodes;
}


/**
 * A progress bar that can pass 100%.
 *
 * Past its own cost a machine keeps earning, and clipping the bar at full would
 * hide the most interesting number on the screen - so the bar fills, and
 * anything beyond is drawn as an overflow in a different colour.
 */
function roiBar(r) {
  const percent = Math.max(0, r.percent);
  const filled = Math.min(100, percent);
  const over = Math.max(0, Math.min(100, percent - 100));
  return el('div', { class: 'roi' }, [
    el('div', { class: 'roi__track' }, [
      el('div', { class: 'roi__fill', style: { width: `${filled}%` } }),
      over > 0 ? el('div', { class: 'roi__over', style: { width: `${over}%` } }) : null,
    ]),
    el('span', { class: 'roi__value value', text: `${percent.toFixed(0)}%` }),
  ]);
}

export function sidebar(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  const filter = state.ui.filter || {};
  const setFilter = (key) => (value) => {
    state.ui.filter = { ...filter, [key]: value || null };
    touch(rerender);
  };

  return [
    section('dash-filter', 'Filter', [
      selectField('filter-customer', 'Customer',
        [{ value: '', label: 'Everyone' },
          ...state.customers.map((c) => ({ value: c.id, label: c.name }))],
        filter.customerId || '', setFilter('customerId')),
      selectField('filter-status', 'Project status',
        [{ value: '', label: 'Any status' },
          ...['draft', 'quoted', 'accepted', 'in-production', 'complete', 'invoiced']
            .map((s) => ({ value: s, label: s }))],
        filter.status || '', setFilter('status')),
      el('div', { class: 'field-grid' }, [
        textField('filter-from', 'From', filter.range?.from || '',
          (v) => { state.ui.filter = { ...filter, range: { ...(filter.range || {}), from: v } }; touch(rerender); },
          { placeholder: 'YYYY-MM-DD' }),
        textField('filter-to', 'To', filter.range?.to || '',
          (v) => { state.ui.filter = { ...filter, range: { ...(filter.range || {}), to: v } }; touch(rerender); },
          { placeholder: 'YYYY-MM-DD' }),
      ]),
      buttonRow([button('Clear the filter', () => { state.ui.filter = {}; touch(rerender); },
        { key: 'clear-filter' })]),
    ]),

    section('dash-capacity', 'Capacity', [
      selectField('capacity-source', 'Measure capacity by',
        CAPACITY_SOURCES.map((s) => ({ value: s.id, label: s.name })),
        settings.demand.capacitySource, (v) => { settings.demand.capacitySource = v; touch(rerender); }),
      numberField('available-machine', 'Machine hours available per week',
        settings.demand.availableMachineHoursPerWeek,
        (v) => { settings.demand.availableMachineHoursPerWeek = Math.max(1, num(v, 1)); touch(rerender); },
        { min: 1, suffix: 'h' }),
      numberField('available-labour', 'Labour hours available per week',
        settings.demand.availableLabourHoursPerWeek,
        (v) => { settings.demand.availableLabourHoursPerWeek = Math.max(1, num(v, 1)); touch(rerender); },
        { min: 1, suffix: 'h' }),
      numberField('committed-machine', 'Machine hours committed',
        settings.demand.committedMachineHours,
        (v) => { settings.demand.committedMachineHours = Math.max(0, num(v)); touch(rerender); },
        { min: 0, suffix: 'h' }),
    ], { open: false }),

    section('dash-calibration', 'Learning from production', [
      selectField('calibration-scope', 'One correction per',
        CALIBRATION_SCOPES.map((s) => ({ value: s.id, label: s.name })),
        settings.calibration?.scope || DEFAULT_CALIBRATION.scope,
        (v) => {
          settings.calibration = { ...DEFAULT_CALIBRATION, ...(settings.calibration || {}), scope: v };
          touch(rerender);
        }),
      numberField('calibration-min', 'Prints needed before correcting',
        settings.calibration?.minimumSamples ?? DEFAULT_CALIBRATION.minimumSamples,
        (v) => {
          settings.calibration = {
            ...DEFAULT_CALIBRATION,
            ...(settings.calibration || {}),
            minimumSamples: Math.max(1, Math.round(num(v, 5))),
          };
          touch(rerender);
        }, { min: 1, step: 1 }),
      muted('The correction is a median, so one catastrophic run cannot drag every '
        + 'future estimate with it. Failed prints count towards the failure rate and are '
        + 'left out of the time and material correction.'),
    ], { open: false }),

    section('dash-export', 'Export', [
      buttonRow([button('CSV of every print', () => {
        const samples = samplesFrom(state.projects);
        downloadCsv([
          ['When', 'Project', 'Part', 'Profile', 'Printer', 'Failed', 'Qty', 'Accepted',
            'Rejected', 'Est minutes', 'Actual minutes', 'Est grams', 'Actual grams'],
          ...samples.map((s) => [
            s.at, s.projectId, s.partName, s.profileId, s.printerId, s.failed ? 'yes' : 'no',
            s.quantity, s.accepted, s.rejected,
            s.estimatedMinutes.toFixed(1), s.actualMinutes.toFixed(1),
            s.estimatedGrams.toFixed(1), s.actualGrams.toFixed(1),
          ]),
        ], 'production-history');
      }, { key: 'export-history' })]),
    ], { open: false }),
  ];
}
