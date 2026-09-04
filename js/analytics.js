/**
 * Business analytics. Pure.
 *
 * Every figure here is folded from projects, documents and stock movements.
 * Nothing is cached and nothing is stored, because a stored total is wrong from
 * the first edit that does not remember to update it.
 *
 * Where there is not enough data to answer a question, the answer is `null` and
 * the UI says "not enough data yet" - which is true, and far more useful than a
 * confident zero.
 */

import { num } from './money.js';
import { partStats } from './projects.js';
import { isOverdue, outstanding } from './documents.js';
import { machineHourCost } from './printers.js';

const inRange = (iso, range) => {
  if (!range || (!range.from && !range.to)) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t > new Date(range.to).getTime() + 86400000 - 1) return false;
  return true;
};

/** Everything the dashboard shows, for a filtered slice of the data. */
export function dashboard({ projects = [], settings, filter = {} }, now = new Date()) {
  const live = projects.filter((p) => {
    if (filter.customerId && p.customerId !== filter.customerId) return false;
    if (filter.status && p.status !== filter.status) return false;
    return inRange(p.createdAt, filter.range);
  });

  const quotes = live.flatMap((p) => p.quotes || []).filter((q) => inRange(q.issuedAt, filter.range));
  const invoices = live.flatMap((p) => p.invoices || []).filter((i) => inRange(i.issuedAt, filter.range));

  const revenue = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((t, i) => t + num(i.total), 0);
  const paid = invoices.reduce((t, i) => t + num(i.paid), 0);
  const owed = invoices.reduce((t, i) => t + outstanding(i), 0);
  const overdue = invoices.filter((i) => isOverdue(i, now));

  const ctc = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((t, i) => t + num(i.internal?.costToCompany), 0);
  const profit = revenue - ctc;

  /* --- production ----------------------------------------------------- */

  const partRows = live.flatMap((project) => project.parts.map((part) => ({
    project, part, stats: partStats(part),
  })));

  const printed = partRows.reduce((t, r) => t + r.stats.printed, 0);
  const accepted = partRows.reduce((t, r) => t + r.stats.accepted, 0);
  const rejected = partRows.reduce((t, r) => t + r.stats.rejected, 0);
  const machineMinutes = partRows.reduce((t, r) => t + r.stats.actualMinutes, 0);
  const grams = partRows.reduce((t, r) => t + r.stats.actualGrams, 0);

  /* --- per printer and per material ------------------------------------ */

  const byPrinter = groupAttempts(live, (a, part) => a.printerId || part.printerId);
  const byMaterial = groupAttempts(live, (a, part) => a.materialId || part.materialId);

  for (const row of byPrinter) {
    const printer = settings.printers.find((p) => p.id === row.key);
    row.name = printer?.name || row.key || 'Unassigned';
    row.hourCost = printer ? machineHourCost(printer).total : null;
    row.costOfTime = row.hourCost == null ? null : (row.minutes / 60) * row.hourCost;
  }
  for (const row of byMaterial) {
    const material = settings.materials.find((m) => m.id === row.key);
    row.name = material ? `${material.name} ${material.colour}` : (row.key || 'Unassigned');
  }

  /* --- the parts worth knowing about ------------------------------------ */

  const scored = partRows
    .filter((r) => r.stats.accepted > 0)
    .map((r) => {
      const unitPrice = quotedUnitPrice(r.project, r.part);
      const cost = r.stats.costPerAccepted;
      return {
        ...r,
        unitPrice,
        costPerAccepted: cost,
        profitPerAccepted: unitPrice != null && cost != null ? unitPrice - cost : null,
        rejectionRate: r.stats.rejectionRate,
      };
    });

  const mostProfitable = [...scored]
    .filter((r) => r.profitPerAccepted != null)
    .sort((a, b) => b.profitPerAccepted - a.profitPerAccepted)
    .slice(0, 5);
  const mostRejected = [...scored]
    .filter((r) => r.rejectionRate != null && r.stats.printed >= 3)
    .sort((a, b) => b.rejectionRate - a.rejectionRate)
    .slice(0, 5);

  return {
    counts: {
      projects: live.length,
      active: live.filter((p) => !['archived', 'cancelled', 'complete'].includes(p.status)).length,
      openQuotes: quotes.filter((q) => q.status === 'draft' || q.status === 'sent').length,
      invoices: invoices.length,
      overdue: overdue.length,
    },
    money: {
      revenue,
      paid,
      owed,
      overdue: overdue.reduce((t, i) => t + outstanding(i), 0),
      costToCompany: ctc,
      profit,
      margin: revenue > 0 ? profit / revenue : null,
      averageOrder: invoices.length ? revenue / invoices.length : null,
    },
    production: {
      printed,
      accepted,
      rejected,
      rejectionRate: printed > 0 ? rejected / printed : null,
      machineHours: machineMinutes / 60,
      kgUsed: grams / 1000,
      costPerAccepted: accepted > 0 && ctc > 0 ? ctc / accepted : null,
    },
    byPrinter: byPrinter.sort((a, b) => b.minutes - a.minutes),
    byMaterial: byMaterial.sort((a, b) => b.grams - a.grams),
    mostProfitable,
    mostRejected,
    quotes,
    invoices,
    conversion: quotes.length
      ? quotes.filter((q) => q.status === 'accepted').length / quotes.length
      : null,
  };
}

function groupAttempts(projects, keyOf) {
  const groups = new Map();
  for (const project of projects) {
    for (const part of project.parts || []) {
      for (const attempt of part.attempts || []) {
        const key = keyOf(attempt, part) || 'unassigned';
        if (!groups.has(key)) {
          groups.set(key, {
            key, attempts: 0, printed: 0, accepted: 0, rejected: 0, failed: 0, minutes: 0, grams: 0,
          });
        }
        const row = groups.get(key);
        row.attempts += 1;
        row.printed += Math.max(1, num(attempt.quantity, 1));
        row.accepted += num(attempt.accepted);
        row.rejected += num(attempt.rejected);
        if (attempt.failed) row.failed += 1;
        row.minutes += num(attempt.minutes);
        row.grams += num(attempt.grams);
      }
    }
  }
  return [...groups.values()].map((row) => ({
    ...row,
    rejectionRate: row.printed > 0 ? row.rejected / row.printed : null,
    failureRate: row.attempts > 0 ? row.failed / row.attempts : null,
  }));
}

/** The most recent price this part was quoted at, or null. */
function quotedUnitPrice(project, part) {
  const documents = [...(project.invoices || []), ...(project.quotes || [])];
  for (let i = documents.length - 1; i >= 0; i -= 1) {
    const hit = (documents[i].lines || []).find((l) => l.name === part.name);
    if (hit) return num(hit.unitPrice);
  }
  return null;
}

/**
 * How loaded the workshop is, for the automatic demand multiplier.
 *
 * Counts only work that is actually committed - accepted or in production. A
 * quote nobody has agreed to is not capacity, and treating it as such would
 * raise prices on the strength of work that may never arrive.
 */
export function committedLoad(projects, settings) {
  const committed = projects.filter((p) => ['accepted', 'in-production'].includes(p.status));
  let machineHours = 0;
  let labourHours = 0;
  let jobs = 0;

  for (const project of committed) {
    for (const part of project.parts || []) {
      const stats = partStats(part);
      const remaining = Math.max(0, Math.max(1, num(part.quantity, 1)) - stats.accepted);
      if (remaining <= 0) continue;
      jobs += 1;
      // Estimated rather than actual: this is work that has not happened yet.
      const each = stats.estimatedMinutes > 0 && stats.printed > 0
        ? stats.estimatedMinutes / stats.printed
        : num(part.lastEstimatedMinutes, 60);
      machineHours += (each * remaining) / 60;
      labourHours += (num(settings?.capacity?.labourMinutesPerPart, 12) * remaining) / 60;
    }
  }

  return { machineHours, labourHours, jobs, projects: committed.length };
}

/** A tiny series for a sparkline: revenue by month. */
export function revenueByMonth(projects, months = 12, now = new Date()) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleString(undefined, { month: 'short' }),
      revenue: 0,
      cost: 0,
    });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));

  for (const project of projects) {
    for (const invoice of project.invoices || []) {
      if (invoice.status === 'cancelled' || !invoice.issuedAt) continue;
      const key = invoice.issuedAt.slice(0, 7);
      const bucket = index.get(key);
      if (!bucket) continue;
      bucket.revenue += num(invoice.total);
      bucket.cost += num(invoice.internal?.costToCompany);
    }
  }
  return buckets;
}
