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

/* ------------------------------------------------------ the live schedule -- */

const HOUR_MS = 60 * 60 * 1000;

/** A Date at a whole hour on the same calendar day (local time). */
function atHour(date, hour) {
  const d = new Date(date);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d;
}

/**
 * A working-hours week the schedule can read: seven days indexed by getDay()
 * (0 = Sunday … 6 = Saturday), each `{ working, start, end }`. Callers may pass
 * a `week` directly, or the single-window `dayStartHour`/`endOfDayHour`, which
 * become a uniform window on EVERY day (so a caller that does not care about the
 * weekend still behaves as before).
 */
function resolveWeek({ week, dayStartHour = 8, endOfDayHour = 16 } = {}) {
  if (Array.isArray(week) && week.length === 7) {
    return week.map((d) => ({
      working: d?.working !== false,
      start: Number.isFinite(d?.start) ? d.start : 8,
      end: Number.isFinite(d?.end) ? d.end : 16,
    }));
  }
  return Array.from({ length: 7 }, () => ({ working: true, start: dayStartHour, end: endOfDayHour }));
}

/** The working window for the calendar day `date` falls on. */
function dayWindow(week, date) {
  const d = week[date.getDay()] || { working: true, start: 8, end: 16 };
  let start = d.start;
  let end = d.end;
  if (!(end > start)) end = Math.min(24, start + 8);
  return { working: !!d.working, start, end };
}

/** True when `date` lands inside a WORKING day's attended window [start, end). */
function inAttendedWindow(date, week) {
  const c = dayWindow(week, date);
  if (!c.working) return false;
  const h = date.getHours() + date.getMinutes() / 60;
  return h >= c.start && h < c.end;
}

/**
 * The next moment an attended job of `hours` can START and still FINISH within a
 * working day's attended window, at or after `from`. Non-working days (a closed
 * weekend) are skipped entirely. If the job is longer than a whole window it
 * cannot fit any day — then it starts at the next working opening and is flagged
 * as overrunning, because a person cannot stay the whole time.
 */
function nextAttendedStart(from, hours, week) {
  let cursor = new Date(from);
  for (let i = 0; i < 800; i += 1) {
    const c = dayWindow(week, cursor);
    if (c.working) {
      const open = atHour(cursor, c.start);
      const close = atHour(cursor, c.end);
      const windowHours = Math.max(0.1, c.end - c.start);
      const tooLong = hours > windowHours;
      const start = cursor.getTime() > open.getTime() ? new Date(cursor) : open;
      if (start.getTime() < close.getTime()) {
        if (tooLong && start.getTime() <= open.getTime() + 1) {
          return { start: open, overruns: true };
        }
        if (start.getTime() + hours * HOUR_MS <= close.getTime()) {
          return { start, overruns: false };
        }
      }
    }
    // Past today's window (or a non-working day): jump to the next day's start.
    const next = new Date(cursor.getTime() + DAY_MS);
    next.setHours(0, 0, 0, 0);
    cursor = next;
  }
  return { start: new Date(from), overruns: true };
}

/**
 * The next moment SOMEONE IS THERE TO START a print, at or after `from` — i.e.
 * the next working-hours opening. If `from` already falls inside a working
 * window it is returned unchanged; otherwise it jumps to the next window's
 * start. A print can run unattended through the night, but nobody is there to
 * START the following one at 02:00, so its start waits for the morning.
 */
function nextWorkingStart(from, week) {
  let cursor = new Date(from);
  for (let i = 0; i < 800; i += 1) {
    const c = dayWindow(week, cursor);
    if (c.working) {
      const open = atHour(cursor, c.start);
      const close = atHour(cursor, c.end);
      if (cursor.getTime() < close.getTime()) {
        return cursor.getTime() >= open.getTime() ? new Date(cursor) : open;
      }
    }
    const next = new Date(cursor.getTime() + DAY_MS);
    next.setHours(0, 0, 0, 0);
    cursor = next;
  }
  return new Date(from);
}

/**
 * Order a printer's queue with an eye on the clock.
 *
 * Priority (running, then age) is never overridden. WITHIN a band, when the
 * workshop looks matters:
 *   - during a working day, the prints that still finish by end-of-day come
 *     first, shortest first, so as many small jobs as possible clear before the
 *     operator leaves; the longer prints fall in behind and take the night;
 *   - outside working hours — the evening, or a non-working day like a weekend —
 *     the longest UNATTENDED print goes first so it uses the night, and the
 *     attended jobs wait for the next working day.
 * A job that needs a person (manual colour swap) can never take the night.
 */
function orderForClock(jobs, { now, week, overnightAllowed }) {
  const attendedNow = inAttendedWindow(now, week);
  const nowH = now.getHours() + now.getMinutes() / 60;
  const remainingToday = attendedNow ? dayWindow(week, now).end - nowH : 0;

  const canNight = (j) => overnightAllowed && !j.needsAttendance;

  return [...jobs].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (attendedNow) {
      // Prints that finish by end-of-day first, shortest first; the rest behind.
      const aFits = a.machineHours <= remainingToday;
      const bFits = b.machineHours <= remainingToday;
      if (aFits !== bFits) return aFits ? -1 : 1;
      if (aFits && bFits) return a.machineHours - b.machineHours;
      // Neither fits today: the ones that can run overnight go first, longest first.
      if (canNight(a) !== canNight(b)) return canNight(a) ? -1 : 1;
      return b.machineHours - a.machineHours;
    }
    // Evening / overnight / a day off: the longest print that can be left
    // unattended goes first, to use the stretch of hours nobody is there. This
    // orders by length regardless of the overnight-HIRA toggle — that toggle
    // only governs whether a job may START outside working hours, not the order
    // the machine works through its queue.
    const nightA = !a.needsAttendance;
    const nightB = !b.needsAttendance;
    if (nightA !== nightB) return nightA ? -1 : 1;
    if (nightA && nightB) return b.machineHours - a.machineHours;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

/**
 * A clock-aware, live schedule: real start and finish TIMES, not whole days.
 *
 * The same list scheduling as `schedule`, but it advances an actual clock per
 * printer from `now`, so two jobs on one machine get distinct start times (the
 * second begins the moment the first comes off) and the answer changes through
 * the day — look at 23:00 and a long unattended print is offered the night;
 * look at 08:00 and the short prints are offered the attended day while the long
 * one is set to start at end-of-day and run overnight.
 *
 * Attended jobs (a manual colour swap needs a person) are only placed inside the
 * attended window; unattended jobs run whenever the machine is free, including
 * overnight when `overnightAllowed`. When overnight is NOT allowed, every job is
 * treated as attended, so nothing is left running past the end of the day.
 *
 * `jobs`/`printers` are as `schedule`; options add `now`, `overnightAllowed`,
 * and the working hours — either a per-day `week` (getDay()-indexed
 * `{ working, start, end }`) or the single-window `dayStartHour`/`endOfDayHour`,
 * which apply to every day.
 */
export function liveSchedule(jobs, printers, {
  now = Date.now(), week, dayStartHour = 8, endOfDayHour = 16, overnightAllowed = false,
} = {}) {
  const nowDate = new Date(now);
  const cal = resolveWeek({ week, dayStartHour, endOfDayHour });
  const byId = new Map((printers || []).map((p) => [p.id, p]));

  const prepared = (jobs || []).map((j) => ({
    ...j,
    machineHours: Math.max(0, num(j.machineHours)),
    needsAttendance: !!j.needsAttendance,
    rank: QUEUE_STATUS_RANK[j.status] ?? 99,
  }));

  const placed = [];
  const unplaced = [];
  const clocks = new Map(); // printerId -> Date the machine is next free

  // Group by printer and order each queue for the current clock.
  const groups = new Map();
  for (const job of prepared) {
    if (!byId.has(job.printerId)) { unplaced.push(job); continue; }
    if (!groups.has(job.printerId)) groups.set(job.printerId, []);
    groups.get(job.printerId).push(job);
  }

  for (const [printerId, queue] of groups) {
    const printer = byId.get(printerId);
    const ordered = orderForClock(queue, {
      now: nowDate, week: cal, overnightAllowed,
    });
    let clock = new Date(nowDate);
    // The FIRST job on the machine is the one you can start right now — you are
    // looking at the schedule, so it may begin even outside working hours (kick
    // off an overnight print at 23:00). Every LATER job needs a person to start
    // it, so if the machine only frees up at 02:00 it waits for the next working
    // opening — nobody is there to load it in the small hours.
    let firstOnMachine = true;
    for (const job of ordered) {
      // Only the machine's FIRST job may begin right now: it is either the print
      // physically running, or the one you can start this minute because you are
      // at the schedule. Every later job needs someone to start it, so it waits
      // for a working-hours opening (an attended job must also fit the window).
      // A second job marked "in production" is really just queued — one machine
      // runs one print at a time — so it is placed like any other later job.
      const attended = job.needsAttendance || !overnightAllowed;
      let start;
      let overruns = false;
      if (firstOnMachine && (job.status === 'in-production' || !attended)) {
        start = new Date(clock);
      } else if (attended) {
        const slot = nextAttendedStart(clock, job.machineHours, cal);
        start = slot.start;
        overruns = slot.overruns;
      } else {
        start = nextWorkingStart(clock, cal);
      }
      const end = new Date(start.getTime() + job.machineHours * HOUR_MS);
      clock = new Date(end);
      firstOnMachine = false;
      const runsOvernight = !inAttendedWindow(end, cal)
        || end.getDate() !== start.getDate();
      placed.push({
        ...job,
        printerId,
        printerName: printer.name,
        startAt: start,
        endAt: end,
        startsNow: Math.abs(start.getTime() - nowDate.getTime()) < 30 * 60 * 1000,
        runsOvernight,
        overrunsAttendedDay: overruns,
        window: attended ? 'attended' : 'unattended',
      });
    }
    clocks.set(printerId, clock);
  }

  // Per-printer recommendation of what to put on the machine right now.
  const recommendations = [];
  for (const [printerId, queue] of groups) {
    const printer = byId.get(printerId);
    const mine = placed.filter((j) => j.printerId === printerId)
      .sort((a, b) => a.startAt - b.startAt);
    const first = mine[0];
    if (!first) continue;
    let note;
    if (first.status === 'in-production') {
      note = `${first.name} is running — ready about ${fmtClock(first.endAt)}.`;
    } else if (first.startsNow) {
      note = first.runsOvernight
        ? `Start ${first.name} now — it runs overnight, ready about ${fmtClock(first.endAt)}.`
        : `Start ${first.name} now — ready about ${fmtClock(first.endAt)}.`;
    } else {
      note = `Next: ${first.name} at ${fmtClock(first.startAt)} — ready about ${fmtClock(first.endAt)}.`;
    }
    recommendations.push({
      printerId, printerName: printer.name, startNowJobId: first.startsNow ? first.id : null, note, first,
    });
  }

  return {
    now: nowDate,
    placed,
    unplaced,
    recommendations,
    freeFrom: Object.fromEntries([...clocks.entries()].map(([id, c]) => [id, c])),
  };
}

/** A short local wall-clock label like "Tue 09:30". */
export function fmtClock(date) {
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** The lead time to promise for a job about to land on a given printer. */
export function leadTimeFor(scheduleResult, printerId, machineHours, hoursPerDay = 12) {
  const t = scheduleResult.timelines.find((x) => x.id === printerId);
  const hpd = t ? t.hoursPerDay : Math.max(0.1, hoursPerDay);
  const queued = t ? t.totalHours : 0;
  return Math.max(1, Math.ceil((queued + Math.max(0, num(machineHours))) / hpd));
}
