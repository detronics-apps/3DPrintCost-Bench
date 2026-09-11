/**
 * The production schedule: a calendar for the workshop.
 *
 * Every approved job is queued onto the printer it runs on, and the scheduler
 * works out when each bed should start and the day it comes off. That last date
 * is the lead time to promise the customer - not a guess, but what the machines
 * can actually clear given everything already ahead of it.
 *
 * The scheduling itself is pure and lives in js/scheduler.js; this only gathers
 * the jobs, prices them for their machine-hours, and draws the result.
 */

import { el, svg } from '../dom.js';
import {
  section, numberField, checkField, statTile, table, muted, banner, emptyState, pill,
} from '../controls.js';
import { calculateOrder } from '../../engine.js';
import { orderFromProject, statusOf } from '../../projects.js';
import {
  schedule, liveSchedule, fmtClock, isQueued,
} from '../../scheduler.js';
import { num } from '../../money.js';
import { state, customerFor, saveSoon } from '../../state.js';

export const id = 'scheduler';
export const name = 'Schedule';
export const short = 'Plan';

/** Machine-hours and the printer that carries most of them, for one project. */
function jobFromProject(project, settings) {
  let result;
  try {
    result = calculateOrder(orderFromProject(project, { customer: customerFor(project) }), settings);
  } catch {
    return null;
  }
  const byPrinter = new Map();
  let totalMinutes = 0;
  let needsAttendance = false;
  for (const line of result.lines) {
    // The machine time includes any paused wait for a manual colour swap: the
    // machine is occupied for that stretch even though it is not printing.
    const perPart = Math.max(0, num(line.detail?.machineMinutes)) + Math.max(0, num(line.swapWaitMinutes));
    totalMinutes += perPart * Math.max(1, num(line.quantity, 1));
    if (line.needsAttendance) needsAttendance = true;
    const pid = line.printer?.id;
    if (pid) byPrinter.set(pid, (byPrinter.get(pid) || 0) + perPart);
  }
  // The job runs on whichever printer does most of its hours.
  const printerId = [...byPrinter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    || project.printerId || project.parts[0]?.printerId || null;

  return {
    id: project.id,
    projectId: project.id,
    name: project.name || 'Project',
    customerName: project.customerName || customerFor(project)?.name || '',
    printerId,
    machineHours: totalMinutes / 60,
    status: project.status,
    createdAt: project.createdAt,
    /** Manual colour swaps need a person, so this job cannot run overnight. */
    needsAttendance,
  };
}

function fmtDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const clampHour = (v, fallback) => Math.max(0, Math.min(24, Math.round(num(v, fallback))));

/** The attended workday, read from settings with a sane fallback. */
function workday(settings) {
  const dayStartHour = clampHour(settings.scheduler.dayStartHour, 8);
  let endOfDayHour = clampHour(settings.scheduler.endOfDayHour, 16);
  if (endOfDayHour <= dayStartHour) endOfDayHour = Math.min(24, dayStartHour + 8);
  return { dayStartHour, endOfDayHour };
}

/* ----------------------------------------------------------------- gantt -- */

function gantt(result) {
  const rows = result.timelines.filter((t) => t.jobs.length > 0);
  if (!rows.length) return null;

  const horizon = Math.max(1, result.horizonDays);
  const rowH = 34;
  const labelW = 120;
  const dayW = Math.max(14, Math.min(48, Math.round(560 / horizon)));
  const width = labelW + horizon * dayW + 16;
  const height = rows.length * rowH + 34;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'Production schedule by printer',
    class: 'gantt',
  });

  // Day gridlines and a few labels.
  for (let d = 0; d <= horizon; d += 1) {
    const x = labelW + d * dayW;
    root.appendChild(svg('line', {
      x1: x, y1: 24, x2: x, y2: height - 6,
      stroke: 'var(--border)', 'stroke-width': d % 5 === 0 ? 1.2 : 0.5,
    }));
    if (d % 5 === 0 || horizon <= 10) {
      root.appendChild(svg('text', {
        x: x + 2, y: 16, 'font-size': 10, fill: 'var(--text-faint)',
      }, [`d${d}`]));
    }
  }

  rows.forEach((tline, i) => {
    const y = 24 + i * rowH;
    root.appendChild(svg('text', {
      x: 0, y: y + rowH / 2 + 3, 'font-size': 12, fill: 'var(--text)',
    }, [tline.name]));

    tline.jobs.forEach((job) => {
      const x = labelW + job.startDay * dayW;
      const w = Math.max(dayW * 0.6, (job.endDay - job.startDay) * dayW - 3);
      const running = job.status === 'in-production';
      root.appendChild(svg('rect', {
        x: x + 1, y: y + 5, width: w, height: rowH - 12, rx: 4,
        fill: running ? 'var(--accent-strong)' : 'var(--accent-soft)',
        stroke: running ? 'var(--accent-strong)' : 'var(--border-strong)',
      }));
      root.appendChild(svg('text', {
        x: x + 6, y: y + rowH / 2 + 3, 'font-size': 10,
        fill: running ? 'var(--accent-ink)' : 'var(--text)',
      }, [job.name.length > 14 ? `${job.name.slice(0, 13)}…` : job.name]));
    });
  });

  return el('div', { class: 'viewport__stage' }, [root]);
}

/* ------------------------------------------------------------------ tool -- */

export function sidebar(ctx) {
  const { rerender } = ctx;
  const settings = state.settings;
  return [
    section('sched-capacity', 'Capacity', [
      numberField('sched-hours', 'Run-hours per printer, per day', settings.scheduler.hoursPerDay,
        (v) => { settings.scheduler.hoursPerDay = Math.max(0.5, num(v, 12)); saveSoon(); rerender(); }, {
          min: 0.5, step: 0.5, suffix: 'h/day',
          info: 'How many hours of printing a machine clears in a day — a mix of attended '
            + 'setup and long unattended runs. A slower day here pushes every lead time out.',
        }),
      muted('Only paid, approved jobs — Accepted and In production — are scheduled. Move a '
        + 'project to one of those statuses in Projects and it joins the queue here.'),
    ], { open: true }),

    section('sched-workday', 'Your workday', [
      numberField('sched-day-start', 'Workday starts at', settings.scheduler.dayStartHour,
        (v) => { settings.scheduler.dayStartHour = clampHour(v, 8); saveSoon(); rerender(); }, {
          min: 0, max: 23, step: 1, suffix: ':00',
          info: 'The hour someone is at the machines. The live plan below only starts an '
            + 'attended print during these hours.',
        }),
      numberField('sched-day-end', 'End of the day at', settings.scheduler.endOfDayHour,
        (v) => { settings.scheduler.endOfDayHour = clampHour(v, 16); saveSoon(); rerender(); }, {
          min: 1, max: 24, step: 1, suffix: ':00',
          info: 'When the last person leaves. A print that would still be running after this '
            + 'is set to start at the end of the day and run overnight (if overnight is on), '
            + 'rather than being left half-done.',
        }),
      muted('The live plan reads the clock: look in the evening and a long print is offered '
        + 'the night; look in the morning and the short prints that finish by end-of-day come '
        + 'first.'),
    ], { open: true }),

    section('sched-overnight', 'Overnight running', [
      checkField('sched-overnight', 'Prioritise long prints for overnight running',
        !!settings.scheduler.overnightLongPrints,
        (v) => { settings.scheduler.overnightLongPrints = v; saveSoon(); rerender(); }, {
          info: 'Only tick this when a HIRA (hazard identification and risk assessment) is in '
            + 'place that makes leaving a printer running unattended overnight safe.',
          hint: 'Puts the longest prints first in each machine’s queue so they run into the '
            + 'night, and leaves the short attended jobs for the day. It saves time — but only '
            + 'do it once overnight running has been risk-assessed as safe.',
        }),
    ], { open: true }),
  ];
}

/**
 * The prints scheduled to start today that have not been marked as started —
 * the head of each printer's queue that is not yet in production. The dashboard
 * flags these so nothing that should be on a machine is quietly sitting idle.
 */
export function printsDueToday(currentState = state) {
  const settings = currentState.settings;
  const queued = currentState.projects.filter((p) => isQueued(p.status) && p.status !== 'archived');
  if (!queued.length) return [];
  const jobs = queued.map((p) => jobFromProject(p, settings)).filter(Boolean);
  const printers = settings.printers.filter((p) => !p.archived).map((p) => ({
    id: p.id,
    name: p.name,
    hoursPerDay: num(p.schedulerHoursPerDay, 0) > 0 ? p.schedulerHoursPerDay : settings.scheduler.hoursPerDay,
  }));
  const result = schedule(jobs, printers, {
    start: Date.now(),
    hoursPerDay: settings.scheduler.hoursPerDay,
    overnightLongPrints: !!settings.scheduler.overnightLongPrints,
  });
  return result.placed.filter((j) => j.startDay === 0 && j.status !== 'in-production');
}

export function main(ctx) {
  const settings = state.settings;
  const queued = state.projects.filter((p) => isQueued(p.status) && p.status !== 'archived');

  if (!queued.length) {
    return [emptyState('Nothing is queued for production. When a quote is accepted and paid, '
      + 'set the project to “Accepted” and it will be scheduled here with a promised finish date.')];
  }

  const jobs = queued.map((p) => jobFromProject(p, settings)).filter(Boolean);
  const printers = settings.printers.filter((p) => !p.archived).map((p) => ({
    id: p.id,
    name: p.name,
    hoursPerDay: num(p.schedulerHoursPerDay, 0) > 0 ? p.schedulerHoursPerDay : settings.scheduler.hoursPerDay,
  }));

  const result = schedule(jobs, printers, {
    start: Date.now(),
    hoursPerDay: settings.scheduler.hoursPerDay,
    overnightLongPrints: !!settings.scheduler.overnightLongPrints,
  });

  // The clock-aware plan: real start/finish times from right now, so the answer
  // changes through the day. This is what "start now" reads from.
  const { dayStartHour, endOfDayHour } = workday(settings);
  const live = liveSchedule(jobs, printers, {
    now: Date.now(),
    dayStartHour,
    endOfDayHour,
    overnightAllowed: !!settings.scheduler.overnightLongPrints,
  });
  const liveById = new Map(live.placed.map((j) => [j.id, j]));

  const nodes = [
    el('div', { class: 'three-numbers' }, [
      statTile('In the queue', String(result.placed.length), {
        hint: `${result.unplaced.length ? `${result.unplaced.length} need a machine · ` : ''}`
          + `${queued.length} project${queued.length === 1 ? '' : 's'}`,
        big: true,
      }),
      statTile('Everything done in', `${result.horizonDays} day${result.horizonDays === 1 ? '' : 's'}`, {
        hint: 'the last plate off the last machine', big: true, tone: 'accent',
      }),
      statTile('Machines running', String(result.timelines.filter((t) => t.jobs.length).length), {
        hint: `of ${printers.length}`, big: true, tone: 'ok',
      }),
    ]),
  ];

  // What to put on each machine right now — the live plan read from the clock.
  if (live.recommendations.length) {
    nodes.push(el('div', { class: 'panel' }, [
      el('div', { class: 'panel__head' }, [
        el('h3', { text: 'What to start now' }),
        pill(`${fmtClock(live.now)} · workday ${dayStartHour}:00–${endOfDayHour}:00`, 'info'),
      ]),
      ...live.recommendations.map((rec) => el('div', {
        class: `startnow${rec.startNowJobId ? ' startnow--go' : ''}`,
      }, [
        el('span', { class: 'startnow__machine', text: rec.printerName }),
        el('span', { class: 'startnow__note', text: rec.note }),
        rec.first?.runsOvernight ? pill('overnight', 'warn') : null,
        rec.first?.overrunsAttendedDay ? pill('longer than a workday', 'warn') : null,
      ].filter(Boolean))),
      muted('This reads the clock and refreshes when you open the tab. In the evening a long '
        + 'unattended print is offered the night; in the morning the short prints that finish by '
        + 'end-of-day come first. It never jumps a running or higher-priority job.'),
    ]));
  }

  if (settings.scheduler.overnightLongPrints) {
    const attended = result.placed.filter((j) => j.needsAttendance);
    nodes.push(banner('info', 'Overnight priority is on: the longest prints are queued first on '
      + 'each machine so they run into the night. Keep this on only while a HIRA covers unattended '
      + 'overnight running.'
      + (attended.length
        ? ` ${attended.length} job${attended.length === 1 ? '' : 's'} need a person for a manual `
          + 'colour swap, so they are kept off the overnight slots and run during the attended day.'
        : '')));
  }

  if (result.unplaced.length) {
    nodes.push(banner('warn', `${result.unplaced.length} job`
      + `${result.unplaced.length === 1 ? '' : 's'} could not be scheduled because the printer `
      + 'they were set to has been archived or removed. Reassign the printer in Projects.'));
  }

  const gnode = gantt(result);
  if (gnode) nodes.push(gnode);

  nodes.push(el('div', { class: 'panel' }, [
    el('h3', { text: 'Start times and promised lead times' }),
    table([
      { label: 'Project', get: (j) => j.name },
      { label: 'Customer', get: (j) => j.customerName || '—' },
      { label: 'Printer', get: (j) => j.printerName },
      { label: 'Machine time', align: 'right', mono: true, get: (j) => `${j.machineHours.toFixed(1)} h` },
      { label: 'Start', mono: true, get: (j) => (liveById.get(j.id) ? fmtClock(liveById.get(j.id).startAt) : fmtDate(j.startDate)) },
      { label: 'Ready', mono: true, get: (j) => (liveById.get(j.id) ? fmtClock(liveById.get(j.id).endAt) : fmtDate(j.endDate)) },
      { label: 'Lead', align: 'right', mono: true, get: (j) => `${j.leadDays} d` },
      {
        label: 'Status',
        get: (j) => el('span', {}, [
          pill(statusOf(j.status).name, statusOf(j.status).tone),
          liveById.get(j.id)?.runsOvernight ? pill('overnight', 'warn') : null,
          j.needsAttendance ? pill('attended', 'warn') : null,
        ].filter(Boolean)),
      },
    ], [...result.placed].sort((a, b) => {
      const la = liveById.get(a.id);
      const lb = liveById.get(b.id);
      if (la && lb) return la.startAt - lb.startAt || la.endAt - lb.endAt;
      return a.startDay - b.startDay || a.endDay - b.endDay;
    })),
    muted('A planning floor, not a promise to the minute: jobs are queued whole onto one '
      + 'machine each and run back to back. It does not split a job across printers or around '
      + 'a part that fails and reprints.'),
  ]));

  return nodes;
}
