/**
 * Importing a returning client's request reuses their customer record instead of
 * creating a duplicate, matched by email or phone, and refreshes it with the
 * newer details — with the imported project re-pointed at the existing record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCustomer, mergeCustomer, makeCustomer } from '../js/projects.js';
import { portalRequest } from '../js/portal-request.js';
import { state, importFile } from '../js/state.js';

/* ----------------------------------------------------- pure matching ------ */

test('matchCustomer finds by email, then phone, ignoring blanks and case', () => {
  const list = [
    makeCustomer({ id: 'a', name: 'Acme', email: 'Buyer@Acme.com', phone: '+27 82 123 4567' }),
  ];
  assert.equal(matchCustomer(list, { email: 'buyer@acme.com' })?.id, 'a', 'email, case-insensitive');
  assert.equal(matchCustomer(list, { phone: '0821234567' })?.id, 'a', 'phone, digits only');
  assert.equal(matchCustomer(list, { email: '', phone: '' }), null, 'blank never matches');
  assert.equal(matchCustomer(list, { email: 'someone@else.com' }), null);
});

test('mergeCustomer keeps the id but takes the newer non-empty details', () => {
  const existing = makeCustomer({ id: 'a', name: 'Acme', email: 'x@acme.com', address: 'Old road', newsletter: false });
  const merged = mergeCustomer(existing, { name: 'Acme Ltd', email: '', address: 'New street 5', newsletter: true });
  assert.equal(merged.id, 'a', 'same record');
  assert.equal(merged.name, 'Acme Ltd', 'newer name wins');
  assert.equal(merged.email, 'x@acme.com', 'a blank does not wipe the old value');
  assert.equal(merged.address, 'New street 5', 'a changed address updates');
  assert.equal(merged.newsletter, true, 'a fresh opt-in turns it on');
});

test('a split first name + surname composes the customer name and is kept', () => {
  const out = portalRequest({
    company: { name: 'X' },
    parts: [{ modelName: 'a', quantity: 1 }],
    customer: { firstName: 'Sam', surname: 'Ndlovu', email: 'sam@x.com' },
    order: { shippingMethodId: 'auto' },
    currencyCode: 'ZAR',
  });
  assert.equal(out.customer.name, 'Sam Ndlovu', 'name is composed from the two parts');
  assert.equal(out.customer.firstName, 'Sam');
  assert.equal(out.customer.surname, 'Ndlovu');
});

/* -------------------------------------------------- full import flow ------ */

const request = (over = {}) => portalRequest({
  company: { name: 'Detronics' },
  parts: [{ modelName: 'Bracket', quantity: 1 }],
  customer: { name: 'Acme', email: 'buyer@acme.com', phone: '082 123 4567', ...over },
  order: { shippingMethodId: 'auto' },
  currencyCode: 'ZAR',
});

test('importing the same client twice makes one customer, and re-points the project', () => {
  state.customers = [];
  state.projects = [];

  const first = importFile(JSON.stringify(request()));
  assert.equal(first.customers, 1);
  assert.equal(state.customers.length, 1);
  const custId = state.customers[0].id;

  // A second request from the same person (same email), with a new address.
  const second = importFile(JSON.stringify(request({
    addressParts: { line1: '5 New Street', city: 'Cape Town', countryId: 'ZA' },
  })));
  assert.equal(second.customers, 1, 'reported as processed');
  assert.equal(state.customers.length, 1, 'but still only one customer record');
  assert.equal(state.customers[0].id, custId, 'the same record');

  // Both imported projects point at that one customer.
  const mine = state.projects.filter((p) => p.customerId === custId);
  assert.equal(mine.length, 2, 'both projects are linked to the existing customer');
});
