/**
 * How long orders take in each phase. Pure.
 *
 * Every workflow transition is already logged on the project's history with a
 * timestamp and the phase it moved from and to, so nobody keeps a stopwatch.
 * From that trail we can reconstruct how long each order actually SAT in each
 * phase — Quotation, Awaiting payment, Production and the rest — and average it
 * across orders, so the workshop can see where the time really goes and which
 * category is worth optimising first.
 *
 * It is honest about what it does not know: an order still in a phase has that
 * phase measured up to `now` (it is still running), and a phase the order never
 * entered is simply absent rather than counted as zero.
 */

import { PHASE_ORDER, phaseName, phaseSkipped } from './workflow.js';

/**
 * The stretches of time one order spent in each phase, in milliseconds.
 *
 * Walks the history's phase transitions in order. The order enters its first
 * phase when it was created; each transition ends the phase it left and starts
 * the one it entered. Whatever phase it is in at the end runs to `now`, unless
 * the order is closed or cancelled — those stop the clock at the last event.
 *
 * Returns { byPhase: { [phaseId]: ms }, total, open } where `open` is the phase
 * still running (null once the order is closed/cancelled).
 */
export function orderPhaseTimes(project, now = Date.now()) {
  const byPhase = {};
  const add = (phase, ms) => {
    if (!phase || !(ms > 0)) return;
    byPhase[phase] = (byPhase[phase] || 0) + ms;
  };

  const history = [...(project.history || [])]
    .filter((e) => e && e.at)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  // The transitions that actually move a phase carry phaseTo. The order starts
  // in whatever phase the first such transition came FROM, at its creation time.
  const moves = history.filter((e) => e.phaseTo && e.phaseFrom);
  const createdAt = new Date(project.createdAt || (history[0] && history[0].at) || now).getTime();

  let currentPhase = moves.length ? moves[0].phaseFrom : project.phase;
  let since = createdAt;

  for (const move of moves) {
    const at = new Date(move.at).getTime();
    add(currentPhase, at - since);
    currentPhase = move.phaseTo;
    since = at;
  }

  // The final phase is still running unless the order has stopped.
  const stopped = currentPhase === 'closed' || currentPhase === 'cancelled'
    || project.phase === 'closed' || project.phase === 'cancelled';
  const openPhase = stopped ? null : currentPhase;
  if (!stopped) add(currentPhase, now - since);

  const total = Object.values(byPhase).reduce((t, ms) => t + ms, 0);
  return { byPhase, total, open: openPhase };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Average time-in-phase across many orders — the "where does the time go" view.
 *
 * Each phase reports the total time spent across every order that passed through
 * it, the number of orders that did, and the average of the two. Company-internal
 * phases an order skips are not counted against it. The result is sorted slowest
 * average first, so the phase worth optimising is at the top.
 */
export function phaseTimeSummary(projects, now = Date.now()) {
  const totals = new Map(); // phaseId -> { totalMs, orders }
  for (const project of projects || []) {
    // A cancelled order's timings are noise (it never finished), so leave it out.
    if (project.phase === 'cancelled') continue;
    const { byPhase } = orderPhaseTimes(project, now);
    for (const [phase, ms] of Object.entries(byPhase)) {
      if (!(ms > 0)) continue;
      if (phaseSkipped(project, phase)) continue;
      const row = totals.get(phase) || { totalMs: 0, orders: 0 };
      row.totalMs += ms;
      row.orders += 1;
      totals.set(phase, row);
    }
  }

  const rows = [...totals.entries()].map(([phase, r]) => ({
    phase,
    name: phaseName(phase),
    totalMs: r.totalMs,
    orders: r.orders,
    averageMs: r.orders ? r.totalMs / r.orders : 0,
    averageDays: r.orders ? r.totalMs / r.orders / DAY_MS : 0,
  }));

  // Keep the pipeline order for ties, but surface the slowest average first.
  rows.sort((a, b) => b.averageMs - a.averageMs
    || PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase));

  return {
    rows,
    slowest: rows[0] || null,
    orders: (projects || []).filter((p) => p.phase !== 'cancelled').length,
  };
}

/** A short human label for a span of milliseconds: minutes, hours or days. */
export function fmtSpan(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  const hours = s / 3600;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
