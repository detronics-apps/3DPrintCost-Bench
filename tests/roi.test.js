/**
 * Has the machine paid for itself?
 *
 * The rule this file exists to pin: a printer is credited only with money that
 * was charged FOR THE MACHINE. Crediting it with the plastic or the labour would
 * make every printer look paid off in a fortnight, which is a comfortable lie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  investment, ownedYears, machineHistory, printerReturn, returnsOnMachines, surplusPool,
} from '../js/roi.js';
import { DEFAULT_PRINTERS, findPrinter, machineHourCost } from '../js/printers.js';
import { makeProject, makePart, addPart, recordAttempt } from '../js/projects.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

const NOW = new Date('2026-09-01T00:00:00Z');
const ender = () => ({ ...findPrinter(DEFAULT_PRINTERS, 'ender-3'), purchaseDate: '2024-09-01' });

const projectWith = (printerId, runs, minutesEach) => {
  let project = addPart(makeProject(), makePart({ printerId }));
  const id = project.parts[0].id;
  for (let i = 0; i < runs; i += 1) {
    project = recordAttempt(project, id, {
      printerId, minutes: minutesEach, grams: 40, quantity: 1, accepted: 1,
    });
  }
  return project;
};

/* --------------------------------------------------------- what is owed -- */

test('what a machine owes is its capital plus what it has cost to run', () => {
  const p = ender();
  const spent = investment(p, { yearsOwned: 2 });

  close(spent.capital, 4500 - 500, 1e-9, 'purchase less what it is still worth');
  close(spent.running, (600 + 400) * 2, 1e-9, 'two years of maintenance and parts');
  close(spent.total, 4000 + 2000, 1e-9, 'the total it has to earn back');
});

test('the residual is not money the machine has to make', () => {
  // You get it back by selling the thing, not by printing with it.
  const a = investment({ purchasePrice: 4500, residualValue: 500 }, { yearsOwned: 0 });
  const b = investment({ purchasePrice: 4500, residualValue: 0 }, { yearsOwned: 0 });
  assert.ok(b.total > a.total);
  close(b.total - a.total, 500, 1e-9, 'exactly the residual');
});

test('years owned comes from the purchase date, and is never negative', () => {
  close(ownedYears(ender(), NOW), 2, 0.01, 'bought two years ago');
  assert.equal(ownedYears({ purchaseDate: null }), 0);
  assert.equal(ownedYears({ purchaseDate: 'not a date' }), 0);
  assert.equal(ownedYears({ purchaseDate: '2099-01-01' }, NOW), 0, 'the future is not negative age');
});

/* ---------------------------------------------------------- the history -- */

test('history is grouped by the machine that actually ran the job', () => {
  const projects = [projectWith('ender-3', 3, 120), projectWith('bambu-x1e', 2, 60)];
  const history = machineHistory(projects);

  assert.equal(history.get('ender-3').attempts, 3);
  close(history.get('ender-3').minutes, 360, 1e-9, 'three two-hour prints');
  assert.equal(history.get('bambu-x1e').attempts, 2);
  assert.equal(history.get('nothing'), undefined);
});

test('a failed print still counts: the machine ran and the money was spent', () => {
  let project = addPart(makeProject(), makePart({ printerId: 'ender-3' }));
  const id = project.parts[0].id;
  project = recordAttempt(project, id, { printerId: 'ender-3', minutes: 90, accepted: 1 });
  project = recordAttempt(project, id, { printerId: 'ender-3', minutes: 200, failed: true, rejected: 1 });

  const row = machineHistory([project]).get('ender-3');
  assert.equal(row.attempts, 2);
  assert.equal(row.failed, 1);
  close(row.minutes, 290, 1e-9, 'the failed hours went on the clock too');
});

/* ------------------------------------------------------------ the return -- */

test('a machine is credited only with what was charged for the machine', () => {
  // 100 hours on the Ender. Its hourly rate is depreciation + maintenance +
  // parts + overhead; only the first three are money the machine has to earn
  // back. Overhead is rent, and rent does not buy a printer.
  const p = ender();
  const rate = machineHourCost(p);
  const r = printerReturn(p, { minutes: 6000, attempts: 50 }, { now: NOW });

  close(r.hours, 100, 1e-9, 'a hundred hours');
  close(r.recovered, 100 * (rate.depreciation + rate.maintenance + rate.parts), 1e-9,
    'depreciation, maintenance and parts — not overhead');
  assert.ok(r.recovered < 100 * rate.total, 'overhead is excluded on purpose');
});

test('profit the machine earned counts towards paying it off', () => {
  const p = ender();
  const bare = printerReturn(p, { minutes: 6000 }, { now: NOW });
  const withProfit = printerReturn(p, { minutes: 6000 }, { profitEarned: 1000, now: NOW });

  close(withProfit.earned - bare.earned, 1000, 1e-9);
  assert.ok(withProfit.fraction > bare.fraction);
});

test('a machine that has earned nothing is at zero, not at nothing', () => {
  const r = printerReturn(ender(), null, { now: NOW });
  assert.equal(r.hours, 0);
  assert.equal(r.earned, 0);
  assert.equal(r.percent, 0, 'zero per cent, which is a fact');
  assert.equal(r.paidOff, false);
  assert.equal(r.hoursToBreakEven, null, 'and how long is not knowable yet');
});

test('a machine that cost nothing has no percentage rather than an infinite one', () => {
  const free = { id: 'gift', name: 'A gift', purchasePrice: 0, residualValue: 0,
    maintenancePerYear: 0, replacementPartsPerYear: 0, hoursPerYear: 500, serviceLifeYears: 5 };
  const r = printerReturn(free, { minutes: 600 }, { now: NOW });
  assert.equal(r.fraction, null, 'nothing to pay back is not a division');
  assert.equal(r.percent, null);
  assert.ok(Number.isFinite(r.earned));
});

test('past 100% the surplus is what buys the next machine', () => {
  const p = { ...ender(), purchasePrice: 1000, residualValue: 0,
    maintenancePerYear: 0, replacementPartsPerYear: 0 };
  const rate = machineHourCost(p);
  const perHour = rate.depreciation + rate.maintenance + rate.parts;
  const hoursForDouble = (2 * 1000) / perHour;

  const r = printerReturn(p, { minutes: hoursForDouble * 60 }, { now: NOW });
  close(r.percent, 200, 0.01, 'it has earned twice what it cost');
  assert.equal(r.paidOff, true);
  close(r.surplus, 1000, 0.01, 'and the second thousand is surplus');
  assert.equal(r.remaining, 0);
});

test('below 100% there is a remaining figure and an estimate of the hours left', () => {
  const p = { ...ender(), purchasePrice: 1000, residualValue: 0,
    maintenancePerYear: 0, replacementPartsPerYear: 0 };
  const rate = machineHourCost(p);
  const perHour = rate.depreciation + rate.maintenance + rate.parts;
  const half = (500 / perHour) * 60;

  const r = printerReturn(p, { minutes: half }, { now: NOW });
  close(r.percent, 50, 0.01);
  assert.equal(r.paidOff, false);
  close(r.remaining, 500, 0.01);
  close(r.hoursToBreakEven, 500 / perHour, 0.01,
    'at the rate it has actually been earning, not a projection');
  assert.equal(r.surplus, 0);
});

/* ----------------------------------------------------------- every machine -- */

test('profit is split between machines by the hours each of them ran', () => {
  const projects = [projectWith('ender-3', 3, 120), projectWith('bambu-x1e', 1, 120)];
  const invoices = [{ status: 'paid', total: 1000, internal: { costToCompany: 600 } }];

  const rows = returnsOnMachines({ printers: DEFAULT_PRINTERS, projects, invoices }, NOW);
  const enderRow = rows.find((r) => r.printerId === 'ender-3');
  const bambuRow = rows.find((r) => r.printerId === 'bambu-x1e');
  const snapRow = rows.find((r) => r.printerId === 'snapmaker-u1');

  close(enderRow.profit, 400 * 0.75, 1e-9, 'three of the four hours');
  close(bambuRow.profit, 400 * 0.25, 1e-9, 'one of the four');
  assert.equal(snapRow.profit, 0, 'a machine that ran nothing earned nothing');
  close(enderRow.profit + bambuRow.profit + snapRow.profit, 400, 1e-9,
    'and the whole profit is accounted for, once');
});

test('a cancelled invoice earns no machine anything', () => {
  const projects = [projectWith('ender-3', 1, 120)];
  const rows = returnsOnMachines({
    printers: DEFAULT_PRINTERS,
    projects,
    invoices: [{ status: 'cancelled', total: 5000, internal: { costToCompany: 100 } }],
  }, NOW);
  assert.equal(rows.find((r) => r.printerId === 'ender-3').profit, 0);
});

test('an invoice that lost money does not take the machine backwards', () => {
  const projects = [projectWith('ender-3', 1, 120)];
  const rows = returnsOnMachines({
    printers: DEFAULT_PRINTERS,
    projects,
    invoices: [{ status: 'paid', total: 50, internal: { costToCompany: 500 } }],
  }, NOW);
  assert.equal(rows.find((r) => r.printerId === 'ender-3').profit, 0,
    'a loss is not negative progress towards paying the machine off');
});

test('with no history at all every machine reports zero, and nothing throws', () => {
  const rows = returnsOnMachines({ printers: DEFAULT_PRINTERS, projects: [], invoices: [] }, NOW);
  assert.equal(rows.length, DEFAULT_PRINTERS.length);
  for (const r of rows) {
    assert.equal(r.hours, 0);
    assert.equal(r.earned, 0);
    assert.ok(Number.isFinite(r.spent.total));
  }
  assert.equal(surplusPool(rows).total, 0);
  assert.equal(surplusPool(rows).paidOff, 0);
});

test('the surplus pool is what the paid-off machines have made beyond their cost', () => {
  const rows = [
    { name: 'A', paidOff: true, surplus: 1200, percent: 240 },
    { name: 'B', paidOff: false, surplus: 0, percent: 40 },
    { name: 'C', paidOff: true, surplus: 300, percent: 110 },
  ];
  const pool = surplusPool(rows);
  assert.equal(pool.total, 1500);
  assert.equal(pool.paidOff, 2);
  assert.deepEqual(pool.machines.map((m) => m.name), ['A', 'C']);
});
