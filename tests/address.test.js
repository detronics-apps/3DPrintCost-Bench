/**
 * Structured addresses fold down to the lines a document shows.
 *
 * The property that matters: the type only chooses the leading line, empties
 * never leave a blank line or a stray comma, and the result is exactly what
 * goes on a quote or invoice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAddressParts, formatAddress, makeCustomer, ADDRESS_TYPES } from '../js/projects.js';

test('a house address leads with the street, no unit or business line', () => {
  const s = formatAddress(makeAddressParts({
    type: 'house', street: '12 Main Road', area: 'Sandton', city: 'Johannesburg',
    province: 'Gauteng', postalCode: '2196', country: 'South Africa',
  }));
  assert.equal(s, '12 Main Road\nSandton, Johannesburg\nGauteng 2196\nSouth Africa');
});

test('a complex leads with the unit and complex name', () => {
  const s = formatAddress(makeAddressParts({
    type: 'complex', unit: '5', complex: 'Sunnyside Estate', street: '10 Oak Ave',
    city: 'Cape Town', postalCode: '8001',
  }));
  assert.equal(s.split('\n')[0], 'Unit 5, Sunnyside Estate');
  assert.match(s, /10 Oak Ave/);
  assert.match(s, /Cape Town/);
});

test('a business leads with the business name', () => {
  const s = formatAddress(makeAddressParts({
    type: 'business', business: 'Acme Robotics', street: '1 Industrial Rd', city: 'Durban',
  }));
  assert.equal(s.split('\n')[0], 'Acme Robotics');
});

test('empty fields never make a blank line or a lonely comma', () => {
  const s = formatAddress(makeAddressParts({ type: 'house', city: 'Pretoria' }));
  assert.equal(s, 'Pretoria', 'just the one thing that was filled in');
  assert.ok(!/,\s*$/.test(s) && !/\n\n/.test(s));
});

test('a plain string address passes through unchanged, for legacy records', () => {
  assert.equal(formatAddress('42 Old Street\nSomewhere'), '42 Old Street\nSomewhere');
  assert.equal(formatAddress(null), '');
});

test('a customer always has a complete addressParts, even from a partial spec', () => {
  const c = makeCustomer({ addressParts: { type: 'business', business: 'Acme' } });
  assert.equal(c.addressParts.type, 'business');
  assert.equal(c.addressParts.business, 'Acme');
  assert.equal(c.addressParts.province, '', 'the rest are filled in as empty');
  assert.ok(ADDRESS_TYPES.some((t) => t.id === 'house'));
});
