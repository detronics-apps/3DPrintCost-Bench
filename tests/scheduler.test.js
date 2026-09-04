/**
 * The production schedule.
 *
 * The properties that matter: priority is honoured (production before merely
 * accepted, then oldest first), a printer's jobs run back-to-back so a busy
 * machine pushes later jobs out, jobs on DIFFERENT machines run in parallel,
 * and a job with no machine is surfaced rather than silently lost.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, leadTimeFor, isQueued } from '../js/scheduler.js';

const START = Date.UTC(2026, 0, 5); // a fixed Monday, so tests are clock-free
const printers = [
  { id: 'bambu', name: 'Bambu', hoursPerDay: 12 },
  { id: 'snap', name: 'Snap', hoursPerDay: 12 },
];

test('only accepted and in-production jobs are in the queue', () => {
  assert.equal(isQueued('accepted'), true);
  assert.equal(isQueued('in-production'), true);
  assert.equal(isQueued('draft'), false);
  assert.equal(isQueued('quoted'), false);
  assert.equal(isQueued('complete'), false);
});

test('jobs on one printer run back to back, so a busy machine pushes later ones out', () => {
  const r = schedule([
    { id: 'a', name: 'A', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '1' },
    { id: 'b', name: 'B', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '2' },
  ], printers, { start: START });

  const a = r.placed.find((j) => j.id === 'a');
  const b = r.placed.find((j) => j.id === 'b');
  assert.equal(a.startDay, 0, 'A starts on day 0');
  assert.equal(a.endDay, 1, '12 h at 12 h/day is one day');
  assert.equal(b.startDay, 1, 'B cannot start until A is off the machine');
  assert.equal(b.endDay, 2);
  assert.equal(b.leadDays, 2, 'so B is promised two days');
});

test('jobs on different printers run in parallel', () => {
  const r = schedule([
    { id: 'a', name: 'A', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '1' },
    { id: 'b', name: 'B', printerId: 'snap', machineHours: 12, status: 'accepted', createdAt: '2' },
  ], printers, { start: START });
  assert.equal(r.placed.find((j) => j.id === 'a').startDay, 0);
  assert.equal(r.placed.find((j) => j.id === 'b').startDay, 0, 'a second machine starts at once');
  assert.equal(r.horizonDays, 1, 'and the whole run is done in a day, not two');
});

test('priority wins: in-production first, then oldest accepted', () => {
  const r = schedule([
    { id: 'new', name: 'New', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '3' },
    { id: 'old', name: 'Old', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '1' },
    { id: 'run', name: 'Running', printerId: 'bambu', machineHours: 12, status: 'in-production', createdAt: '2' },
  ], printers, { start: START });

  const order = r.placed.sort((a, b) => a.startDay - b.startDay).map((j) => j.id);
  assert.deepEqual(order, ['run', 'old', 'new'],
    'the running job first, then the older accepted one, then the newest');
});

test('overnight priority runs the longest print first within a priority band', () => {
  const jobs = [
    { id: 'short', name: 'Short', printerId: 'bambu', machineHours: 3, status: 'accepted', createdAt: '1' },
    { id: 'long', name: 'Long', printerId: 'bambu', machineHours: 20, status: 'accepted', createdAt: '2' },
  ];
  // Off: oldest first, so the short (older) job starts first.
  const off = schedule(jobs, printers, { start: START });
  assert.equal(off.placed.find((j) => j.id === 'short').startDay, 0);

  // On: the long print takes the machine first so it runs into the night.
  const on = schedule(jobs, printers, { start: START, overnightLongPrints: true });
  assert.equal(on.placed.find((j) => j.id === 'long').startDay, 0, 'the long job starts first');
  assert.ok(on.placed.find((j) => j.id === 'short').startDay > 0, 'the short job waits behind it');
});

test('overnight priority keeps attended (manual-swap) jobs off the night', () => {
  const jobs = [
    { id: 'attended', name: 'Multi-colour', printerId: 'bambu', machineHours: 30, status: 'accepted', createdAt: '1', needsAttendance: true },
    { id: 'unattended', name: 'Plain long', printerId: 'bambu', machineHours: 20, status: 'accepted', createdAt: '2', needsAttendance: false },
  ];
  const on = schedule(jobs, printers, { start: START, overnightLongPrints: true });
  // Even though the attended job is longer, the unattended one takes the machine
  // first, because only it can be left to run through the night.
  assert.equal(on.placed.find((j) => j.id === 'unattended').startDay, 0,
    'the unattended long print gets the overnight slot');
  assert.ok(on.placed.find((j) => j.id === 'attended').startDay > 0,
    'the attended one waits, because it cannot run unattended');
  assert.equal(on.placed.find((j) => j.id === 'attended').needsAttendance, true,
    'and it is flagged so the schedule can say why');
});

test('overnight priority never overrides status: a running job still comes first', () => {
  const r = schedule([
    { id: 'longwait', name: 'Long', printerId: 'bambu', machineHours: 30, status: 'accepted', createdAt: '1' },
    { id: 'run', name: 'Running', printerId: 'bambu', machineHours: 6, status: 'in-production', createdAt: '2' },
  ], printers, { start: START, overnightLongPrints: true });
  assert.equal(r.placed.find((j) => j.id === 'run').startDay, 0,
    'the in-production job runs first even though it is shorter');
});

test('a job with no known printer is surfaced, not dropped', () => {
  const r = schedule([
    { id: 'a', name: 'A', printerId: 'bambu', machineHours: 6, status: 'accepted', createdAt: '1' },
    { id: 'x', name: 'X', printerId: 'gone', machineHours: 6, status: 'accepted', createdAt: '2' },
  ], printers, { start: START });
  assert.equal(r.placed.length, 1);
  assert.equal(r.unplaced.length, 1);
  assert.equal(r.unplaced[0].id, 'x');
});

test('the calendar dates follow the day offsets from the start date', () => {
  const r = schedule([
    { id: 'a', name: 'A', printerId: 'bambu', machineHours: 24, status: 'accepted', createdAt: '1' },
  ], printers, { start: START });
  const a = r.placed[0];
  assert.equal(a.endDay, 2, '24 h at 12 h/day is two days');
  assert.equal(a.endDate.getTime(), START + 2 * 24 * 3600 * 1000);
});

test('lead time for a not-yet-approved job sits behind what is already queued', () => {
  const r = schedule([
    { id: 'a', name: 'A', printerId: 'bambu', machineHours: 12, status: 'accepted', createdAt: '1' },
  ], printers, { start: START });
  // The Bambu already has 12 h (one day) queued; a new 12 h job lands behind it.
  assert.equal(leadTimeFor(r, 'bambu', 12), 2);
  // The Snap is idle, so the same job there is a day.
  assert.equal(leadTimeFor(r, 'snap', 12), 1);
});

test('an empty queue schedules nothing and throws nothing', () => {
  const r = schedule([], printers, { start: START });
  assert.deepEqual(r.placed, []);
  assert.equal(r.horizonDays, 0);
});

test('a sweep of hours and statuses produces no NaN and no negative day', () => {
  for (const hours of [0, 0.5, 5, 40, 400]) {
    for (const status of ['accepted', 'in-production']) {
      const r = schedule([
        { id: 'a', name: 'A', printerId: 'bambu', machineHours: hours, status, createdAt: '1' },
      ], printers, { start: START });
      for (const j of r.placed) {
        assert.ok(Number.isFinite(j.startDay) && j.startDay >= 0);
        assert.ok(Number.isFinite(j.endDay) && j.endDay >= 0);
        assert.ok(Number.isFinite(j.leadDays) && j.leadDays >= 1);
      }
    }
  }
});
