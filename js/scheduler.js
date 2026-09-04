/**
 * The production schedule. Pure.
 *
 * Approved jobs are queued onto the printers they run on, highest priority
 * first, and each printer works through its own queue in turn. From that fall
 * out the two things a workshop actually needs: WHEN to start each bed, and the
 * lead time to promise the customer - the day the last plate of their job comes
 * off.
 *
 * This is list scheduling, not a solver. It does not split a job across
 * machines or interleave them, and it assumes a printer's throughput is a flat
 * number of run-hours a day (attended setup plus unattended running). Like the
 * bed packing, it is an honest floor to plan against, not a promise to the
 * minute - and it says so on the screen that shows it.
 *
 * Everything is worked out in whole days from a start date, so it does not
 * depend on the clock and can be tested to the day.
 */

import { num } from './money.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which statuses sit in the production queue, and their order of priority. */
export const QUEUE_STATUS_RANK = {
  'in-production': 0, // already on a machine — finish it first
  accepted: 1, // approved and paid, waiting to start
};

export function isQueued(status) {
  return Object.prototype.hasOwnProperty.call(QUEUE_STATUS_RANK, status);
}

const addDays = (start, days) => new Date(start.getTime() + Math.round(days) * DAY_MS);

/**
 * Place jobs on printers over time.
 *
 * `jobs`     : { id, name, projectId, printerId, machineHours, status, createdAt }
 * `printers` : { id, name, hoursPerDay }
 * `options`  : { start, hoursPerDay (fallback), overnightLongPrints }
 *
 * `overnightLongPrints` is the HIRA switch: with a risk assessment in place that
 * makes unattended overnight running safe, the long jobs are the ones worth
 * leaving to run through the night. Turning it on orders the longest prints
 * first within each priority band, so they land in the overnight stretch and the
 * short attended jobs fill the day. It never overrides priority - a running or
 * older job still comes first; it only decides ties by length instead of age.
 *
 * A job flagged `needsAttendance` (its plate has manual colour swaps that need a
 * person at the machine) can NOT be left to run unattended, so the overnight
 * switch never gives it the night: unattended jobs are ordered ahead of it for
 * the overnight stretch, and it is returned flagged so the workshop is told why.
 *
 * A job whose printer is unknown is not dropped - it is returned in `unplaced`
 * so the workshop sees it needs a machine assigned, rather than a silent gap.
 */
export function schedule(jobs, printers, {
  start = Date.now(), hoursPerDay = 12, overnightLongPrints = false,
} = {}) {
  const startDate = new Date(start);
  const byId = new Map((printers || []).map((p) => [p.id, p]));

  // Highest priority first: production before accepted. Then, ordinarily, oldest
  // first so a queue that has been waiting does not sit behind something just
  // approved. With the overnight switch on, the jobs that can actually use the
  // night come first: unattended before attended, then longest first, so the big
  // unattended prints take the machine overnight and the attended ones fill the
  // attended day.
  const ordered = [...(jobs || [])]
    .map((j) => ({
      ...j,
      machineHours: Math.max(0, num(j.machineHours)),
      needsAttendance: !!j.needsAttendance,
      rank: QUEUE_STATUS_RANK[j.status] ?? 99,
    }))
    .sort((a, b) => a.rank - b.rank
      || (overnightLongPrints ? (a.needsAttendance ? 1 : 0) - (b.needsAttendance ? 1 : 0) : 0)
      || (overnightLongPrints ? b.machineHours - a.machineHours : 0)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      || String(a.name || '').localeCompare(String(b.name || '')));

  // Each printer accumulates run-hours; a job starts when the ones before it
  // have finished.
  const busyHours = new Map();
  const placed = [];
  const unplaced = [];

  for (const job of ordered) {
    const printer = byId.get(job.printerId);
    if (!printer) {
      unplaced.push(job);
      continue;
    }
    const hpd = Math.max(0.1, num(printer.hoursPerDay, hoursPerDay));
    const before = busyHours.get(printer.id) || 0;
    const after = before + job.machineHours;
    busyHours.set(printer.id, after);

    const startDay = Math.floor(before / hpd);
    const endDay = Math.ceil(after / hpd);
    placed.push({
      ...job,
      printerId: printer.id,
      printerName: printer.name,
      startDay,
      endDay,
      startDate: addDays(startDate, startDay),
      endDate: addDays(startDate, endDay),
      leadDays: Math.max(1, endDay),
    });
  }

  const timelines = (printers || []).map((p) => {
    const hpd = Math.max(0.1, num(p.hoursPerDay, hoursPerDay));
    const mine = placed.filter((j) => j.printerId === p.id);
    const hours = busyHours.get(p.id) || 0;
    return {
      id: p.id,
      name: p.name,
      hoursPerDay: hpd,
      jobs: mine,
      totalHours: hours,
      busyDays: Math.ceil(hours / hpd),
    };
  });

  const horizonDays = placed.reduce((m, j) => Math.max(m, j.endDay), 0);

  return {
    startDate,
    placed,
    unplaced,
    timelines,
    horizonDays,
    // The soonest a brand-new job could finish on each printer, for quoting a
    // lead time before the job is even approved.
    freeFrom: Object.fromEntries(timelines.map((t) => [t.id, Math.ceil((busyHours.get(t.id) || 0) / t.hoursPerDay)])),
  };
}

/** The lead time to promise for a job about to land on a given printer. */
export function leadTimeFor(scheduleResult, printerId, machineHours, hoursPerDay = 12) {
  const t = scheduleResult.timelines.find((x) => x.id === printerId);
  const hpd = t ? t.hoursPerDay : Math.max(0.1, hoursPerDay);
  const queued = t ? t.totalHours : 0;
  return Math.max(1, Math.ceil((queued + Math.max(0, num(machineHours))) / hpd));
}
