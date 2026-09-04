/**
 * What a printer has earned back. Pure.
 *
 * A machine is bought with money, and the question every workshop actually
 * wants answered is "has it paid for itself yet, and by how much". This module
 * answers it from the jobs the machine has really run, not from a projection.
 *
 * The rule that keeps it honest: a printer is credited ONLY with the money that
 * was charged for the machine itself - the depreciation and the maintenance in
 * its hourly rate, plus the share of the profit third that its work earned. It
 * is not credited with the plastic, the labour or the shipping, because none of
 * that money was ever going to buy a printer.
 *
 * Past 100% the surplus is real money that the machine has generated beyond its
 * own cost. That is what buys the next one.
 */

import { num } from './money.js';
import { machineHourCost, lifetimeHours } from './printers.js';

/**
 * What one machine has to earn back before it has paid for itself.
 *
 * Purchase price less what it will be worth at the end, because the residual is
 * money you get back by selling it rather than money the machine has to make.
 * Maintenance and parts spent so far are added: they are real money the machine
 * has cost you since.
 */
export function investment(printerSpec, { yearsOwned = null } = {}) {
  const purchase = Math.max(0, num(printerSpec?.purchasePrice));
  const residual = Math.max(0, num(printerSpec?.residualValue));
  const capital = Math.max(0, purchase - residual);

  const years = yearsOwned == null ? ownedYears(printerSpec) : Math.max(0, num(yearsOwned));
  const running = (num(printerSpec?.maintenancePerYear) + num(printerSpec?.replacementPartsPerYear))
    * years;

  return {
    purchase,
    residual,
    capital,
    running,
    years,
    /** What the machine has to earn back to be square. */
    total: capital + running,
  };
}

/** How long this machine has been owned, from its purchase date. */
export function ownedYears(printerSpec, now = new Date()) {
  if (!printerSpec?.purchaseDate) return 0;
  const bought = new Date(printerSpec.purchaseDate).getTime();
  if (!Number.isFinite(bought)) return 0;
  return Math.max(0, (now.getTime() - bought) / (365.25 * 24 * 3600 * 1000));
}

/**
 * Every finished print, grouped by the machine that ran it.
 *
 * Failed prints count: the machine ran, the hours went on the clock, and the
 * money was spent. Leaving them out would flatter the machine that fails most.
 */
export function machineHistory(projects) {
  const byPrinter = new Map();

  for (const project of projects || []) {
    for (const part of project.parts || []) {
      for (const attempt of part.attempts || []) {
        const id = attempt.printerId || part.printerId;
        if (!id) continue;
        if (!byPrinter.has(id)) {
          byPrinter.set(id, {
            printerId: id, attempts: 0, minutes: 0, grams: 0,
            accepted: 0, rejected: 0, failed: 0, firstAt: null, lastAt: null,
          });
        }
        const row = byPrinter.get(id);
        row.attempts += 1;
        row.minutes += num(attempt.minutes);
        row.grams += num(attempt.grams);
        row.accepted += num(attempt.accepted);
        row.rejected += num(attempt.rejected);
        if (attempt.failed) row.failed += 1;
        if (attempt.at && (!row.firstAt || attempt.at < row.firstAt)) row.firstAt = attempt.at;
        if (attempt.at && (!row.lastAt || attempt.at > row.lastAt)) row.lastAt = attempt.at;
      }
    }
  }
  return byPrinter;
}

/**
 * Return on a machine.
 *
 * `profitShareOfMachine` is how much of the profit third a machine is credited
 * with. It is the machine's share of the work, measured in hours - a printer
 * that ran nine of ten hours earned nine tenths of the profit those jobs made.
 */
export function printerReturn(printerSpec, history, { profitEarned = 0, now = new Date() } = {}) {
  const spent = investment(printerSpec, { yearsOwned: ownedYears(printerSpec, now) });
  const rate = machineHourCost(printerSpec);
  const hours = Math.max(0, num(history?.minutes)) / 60;

  // What was charged FOR THE MACHINE: the depreciation and the maintenance in
  // its hourly rate. Not the plastic, not the labour, not the shipping - that
  // money was never going to buy a printer.
  const recovered = hours * (rate.depreciation + rate.maintenance + rate.parts);
  const profit = Math.max(0, num(profitEarned));
  const earned = recovered + profit;

  const target = Math.max(0, spent.total);
  const fraction = target > 0 ? earned / target : null;

  // Hours left before it is square, at the rate it has actually been earning.
  const perHour = hours > 0 ? earned / hours : 0;
  const remaining = Math.max(0, target - earned);
  const hoursToBreakEven = perHour > 0 ? remaining / perHour : null;

  return {
    printerId: printerSpec?.id,
    name: printerSpec?.name,
    spent,
    rate,
    hours,
    lifetimeHours: lifetimeHours(printerSpec),
    hoursUsedFraction: lifetimeHours(printerSpec) > 0 ? hours / lifetimeHours(printerSpec) : null,
    recovered,
    profit,
    earned,
    /** null when there is nothing to pay back, rather than a misleading zero. */
    fraction,
    percent: fraction == null ? null : fraction * 100,
    paidOff: fraction != null && fraction >= 1,
    remaining,
    hoursToBreakEven,
    /** Money the machine has made BEYOND its own cost: what buys the next one. */
    surplus: Math.max(0, earned - target),
    attempts: num(history?.attempts),
    failed: num(history?.failed),
    accepted: num(history?.accepted),
  };
}

/**
 * Every machine's return, from the projects and the invoices.
 *
 * The profit a job made is split between the machines that ran it in proportion
 * to the hours each spent, because that is the only defensible way to say which
 * machine earned it.
 */
export function returnsOnMachines({ printers, projects, invoices = [] }, now = new Date()) {
  const history = machineHistory(projects);

  const totalMinutes = [...history.values()].reduce((t, h) => t + h.minutes, 0);
  const totalProfit = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((t, i) => t + Math.max(0, num(i.total) - num(i.internal?.costToCompany)), 0);

  return (printers || []).map((printer) => {
    const rows = history.get(printer.id) || null;
    const share = totalMinutes > 0 && rows ? rows.minutes / totalMinutes : 0;
    return printerReturn(printer, rows, { profitEarned: totalProfit * share, now });
  });
}

/** A machine that has paid for itself and is now funding the next one. */
export function surplusPool(returns) {
  const total = (returns || []).reduce((t, r) => t + num(r.surplus), 0);
  const paid = (returns || []).filter((r) => r.paidOff);
  return {
    total,
    paidOff: paid.length,
    machines: paid.map((r) => ({ name: r.name, surplus: r.surplus, percent: r.percent })),
  };
}
