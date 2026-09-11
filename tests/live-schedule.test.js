/**
 * The live, clock-aware schedule.
 *
 * Unlike the day-based `schedule`, this advances a real clock per printer from
 * `now`, so two jobs on one machine get distinct start TIMES, attended prints
 * are kept inside the workday, and long unattended prints are offered the night.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSchedule } from '../js/scheduler.js';

const printers = [{ id: 'snap', name: 'Snap' }];
const H = 60 * 60 * 1000;

// A fixed local morning (08:00) and evening (23:00) on the same day.
const morning = new Date(2026, 0, 5, 8, 0, 0, 0);
const evening = new Date(2026, 0, 5, 23, 0, 0, 0);

test('two jobs on one printer get distinct, sequential start times', () => {
  const r = liveSchedule([
    { id: 'ten', name: 'Ten hour', printerId: 'snap', machineHours: 10, status: 'accepted', createdAt: '1' },
    { id: 'two', name: 'Two hour', printerId: 'snap', machineHours: 2, status: 'accepted', createdAt: '2' },
  ], printers, {
    now: evening.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: true,
  });
  const ten = r.placed.find((j) => j.id === 'ten');
  const two = r.placed.find((j) => j.id === 'two');
  // They do not start at the same moment; the second waits for the first.
  assert.notEqual(ten.startAt.getTime(), two.startAt.getTime());
  assert.ok(two.startAt.getTime() >= ten.endAt.getTime(), 'the 2 h waits for the 10 h to finish');
});

test('in the evening, the long unattended print is offered the night, now', () => {
  const r = liveSchedule([
    { id: 'ten', name: 'Ten', printerId: 'snap', machineHours: 10, status: 'accepted', createdAt: '2' },
    { id: 'two', name: 'Two', printerId: 'snap', machineHours: 2, status: 'accepted', createdAt: '1' },
  ], printers, {
    now: evening.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: true,
  });
  const rec = r.recommendations[0];
  assert.equal(rec.startNowJobId, 'ten', 'start the 10 h now — it uses the night');
  const ten = r.placed.find((j) => j.id === 'ten');
  assert.ok(ten.startsNow, 'the long print starts now');
  assert.ok(ten.runsOvernight, 'and it is marked as running overnight');
});

test('in the morning, short prints take the attended day; the long one waits for the night', () => {
  const r = liveSchedule([
    { id: 'ten', name: 'Ten', printerId: 'snap', machineHours: 10, status: 'accepted', createdAt: '2' },
    { id: 'two', name: 'Two', printerId: 'snap', machineHours: 2, status: 'accepted', createdAt: '1' },
  ], printers, {
    now: morning.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: true,
  });
  const rec = r.recommendations[0];
  assert.equal(rec.startNowJobId, 'two', 'the 2 h that finishes by end-of-day starts now');
  const two = r.placed.find((j) => j.id === 'two');
  const ten = r.placed.find((j) => j.id === 'ten');
  assert.ok(two.endAt.getHours() <= 16, 'the short print finishes within the attended day');
  assert.ok(ten.startAt.getTime() > two.startAt.getTime(), 'the long print is queued behind it');
});

test('an attended print is never started so late it runs past end-of-day', () => {
  // 6 h attended job in the morning fits (08–14); in the afternoon it is pushed
  // to the next morning rather than overrunning.
  const afternoon = new Date(2026, 0, 5, 14, 0, 0, 0);
  const r = liveSchedule([
    { id: 'a', name: 'Attend', printerId: 'snap', machineHours: 6, status: 'accepted', createdAt: '1', needsAttendance: true },
  ], printers, {
    now: afternoon.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: true,
  });
  const a = r.placed[0];
  assert.ok(a.startAt.getTime() > afternoon.getTime(), 'it does not start this afternoon');
  assert.equal(a.startAt.getHours(), 8, 'it starts at the next day opening');
});

test('with overnight off, nothing is left running past the end of the day', () => {
  const r = liveSchedule([
    { id: 'a', name: 'A', printerId: 'snap', machineHours: 3, status: 'accepted', createdAt: '1' },
  ], printers, {
    now: evening.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: false,
  });
  const a = r.placed[0];
  assert.equal(a.startAt.getHours(), 8, 'it waits for the morning, not the night');
});

test('a running job is shown on the machine now, finishing from now', () => {
  const r = liveSchedule([
    { id: 'run', name: 'Running', printerId: 'snap', machineHours: 4, status: 'in-production', createdAt: '1' },
  ], printers, {
    now: morning.getTime(), dayStartHour: 8, endOfDayHour: 16, overnightAllowed: true,
  });
  const run = r.placed[0];
  assert.equal(run.startAt.getTime(), morning.getTime(), 'a running job starts from now');
  assert.equal(run.endAt.getTime(), morning.getTime() + 4 * H);
});

test('a job with no known printer is surfaced, not dropped', () => {
  const r = liveSchedule([
    { id: 'x', name: 'X', printerId: 'gone', machineHours: 6, status: 'accepted', createdAt: '1' },
  ], printers, { now: morning.getTime() });
  assert.equal(r.placed.length, 0);
  assert.equal(r.unplaced.length, 1);
});
