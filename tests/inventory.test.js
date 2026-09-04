/**
 * Stock flags: is a material in stock, and enough of it?
 *
 * The property that matters most is the escape hatch: a workshop that records
 * no stock at all must not be nagged about shortfalls it never asked to track.
 * Once a spool is recorded, the numbers are believed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialStock, makeSpool, makeMovement } from '../js/inventory.js';

const inv = (items = [], movements = []) => ({ items, movements });

test('a material with no spool recorded is untracked, and never flagged', () => {
  const s = materialStock(inv(), 'pla-black', 500);
  assert.equal(s.tracked, false);
  assert.equal(s.inStock, false);
  assert.equal(s.enough, true, 'untracked never reports a shortfall');
  assert.equal(s.shortG, 500, 'the number is still there for anyone who wants it');
});

test('a full spool is in stock and enough for a job under its weight', () => {
  const items = [makeSpool({ materialId: 'pla-black', startingG: 1000 })];
  const s = materialStock(inv(items), 'pla-black', 300);
  assert.equal(s.tracked, true);
  assert.equal(s.inStock, true);
  assert.equal(s.enough, true);
  assert.equal(s.onHandG, 1000);
  assert.equal(s.spoolCount, 1);
});

test('a job heavier than what is on hand is flagged short, with the shortfall', () => {
  const items = [makeSpool({ materialId: 'pla-black', startingG: 1000 })];
  const s = materialStock(inv(items), 'pla-black', 1500);
  assert.equal(s.inStock, true, 'there is some');
  assert.equal(s.enough, false, 'but not enough');
  assert.equal(s.shortG, 500);
});

test('a spool booked down to nothing is tracked but out of stock', () => {
  const spool = makeSpool({ materialId: 'pla-black', startingG: 1000 });
  const items = [spool];
  const movements = [makeMovement({ itemId: spool.id, quantity: -1000, reason: 'production' })];
  const s = materialStock(inv(items, movements), 'pla-black', 100);
  assert.equal(s.tracked, true);
  assert.equal(s.onHandG, 0);
  assert.equal(s.inStock, false);
  assert.equal(s.enough, false);
  assert.equal(s.shortG, 100);
});

test('two spools of the same material add up', () => {
  const items = [
    makeSpool({ materialId: 'pla-black', startingG: 400 }),
    makeSpool({ materialId: 'pla-black', startingG: 700 }),
  ];
  const s = materialStock(inv(items), 'pla-black', 1000);
  assert.equal(s.onHandG, 1100);
  assert.equal(s.spoolCount, 2);
  assert.equal(s.enough, true);
});

test('another material’s spools do not count', () => {
  const items = [makeSpool({ materialId: 'petg-grey', startingG: 1000 })];
  const s = materialStock(inv(items), 'pla-black', 100);
  assert.equal(s.tracked, false, 'nothing recorded for THIS material');
  assert.equal(s.onHandG, 0);
});
