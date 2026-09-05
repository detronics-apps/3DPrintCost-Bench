/**
 * The customer's request becomes an importable project + customer.
 *
 * The property that matters: what the portal hands over is exactly what the
 * workshop's importer already reads, so opening it creates the job and the
 * customer with nothing re-typed - and the payload survives the project
 * migration the importer runs on it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalRequest } from '../js/portal-request.js';
import { migrateProject, makeCustomer } from '../js/projects.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const selection = () => ({
  modelName: 'bracket.stl',
  quantity: 8,
  profileId: 'function',
  printerId: 'bambu-x1e',
  materialId: 'petg-dark-grey',
  geometry: analyse(box(40, 40, 20)),
  colours: 1,
});

const customer = () => ({
  name: 'Acme Robotics',
  email: 'buy@acme.test',
  phone: '+27 11 555 0000',
  address: '1 Industrial Rd, Johannesburg',
  notes: 'Matte black if possible.',
});

test('a request is a project with a customer attached, ready for the importer', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    parts: [selection()],
    customer: customer(),
    order: { shippingMethodId: 'courier-za' },
    quotedTotal: 972.5,
    currencyCode: 'ZAR',
  });

  assert.equal(req.kind, 'project', 'the workshop importer reads kind:project');
  assert.equal(req.source, 'customer-portal');
  assert.equal(req.project.customerId, req.customer.id, 'the project points at the customer');
  assert.equal(req.customer.name, 'Acme Robotics');
  assert.equal(req.customer.address, '1 Industrial Rd, Johannesburg');
  assert.equal(req.customer.phone, '+27 11 555 0000');

  assert.equal(req.project.parts.length, 1);
  const part = req.project.parts[0];
  assert.equal(part.quantity, 8);
  assert.equal(part.profileId, 'function');
  assert.equal(part.materialId, 'petg-dark-grey');
  assert.ok(part.geometry, 'the measured geometry travels so nothing is re-measured');
  assert.equal(req.project.order.shippingMethodId, 'courier-za');
  assert.match(req.project.notes, /972\.50/);
});

test('the request project survives the migration the importer applies to it', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    parts: [selection()],
    customer: customer(),
    order: {},
    quotedTotal: null,
  });
  const migrated = migrateProject(req.project);
  assert.equal(migrated.parts.length, 1, 'the part is not dropped by migration');
  assert.equal(migrated.parts[0].quantity, 8);
  // And the customer is a well-formed record.
  const cust = { ...makeCustomer(), ...req.customer };
  assert.equal(cust.name, 'Acme Robotics');
});

test('a request with nothing filled in still produces a valid, safe payload', () => {
  const req = portalRequest({ selection: {}, customer: {}, order: {} });
  assert.equal(req.kind, 'project');
  assert.equal(req.project.parts.length, 1);
  assert.ok(req.customer.name, 'a nameless customer still gets a placeholder name');
  assert.equal(req.project.parts[0].quantity, 1, 'quantity floors at one');
  assert.doesNotThrow(() => migrateProject(req.project));
});

test('a request can carry several parts, one project with many', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    printerId: 'bambu-x1e',
    parts: [
      selection(),
      { modelName: 'housing.stl', quantity: 2, profileId: 'visual',
        printerId: 'bambu-x1e', materialId: 'petg-dark-grey',
        geometry: analyse(box(80, 80, 15)), colours: 1 },
    ],
    customer: customer(),
    order: { shippingMethodId: 'courier-za' },
    quotedTotal: 1500, currencyCode: 'ZAR',
  });
  assert.equal(req.project.parts.length, 2, 'both parts travel');
  assert.equal(req.project.parts[1].name, 'housing.stl');
  assert.equal(req.project.parts[1].quantity, 2);
  assert.match(req.project.name, /2 parts/);
  const migrated = migrateProject(req.project);
  assert.equal(migrated.parts.length, 2, 'migration keeps both');
});

test('a request carries the loaded heads and each part’s mix, filled in for the workshop', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    printerId: 'snapmaker-u1',
    slots: [{ id: 's1', materialId: 'petg-dark-grey' }, { id: 's2', materialId: 'pla-dark-grey' }],
    parts: [{
      ...selection(),
      printerId: 'snapmaker-u1',
      mix: [{ slotId: 's1', percent: 70 }, { slotId: 's2', percent: 30 }],
    }],
    customer: customer(),
    order: {},
    quotedTotal: null,
  });
  const part = req.project.parts[0];
  assert.equal(part.slots.length, 2, 'both heads travel');
  assert.equal(part.slots[1].materialId, 'pla-dark-grey');
  assert.equal(part.mix.length, 2, 'and this part’s share of each');
  assert.equal(part.mix[0].percent, 70);

  const migrated = migrateProject(req.project);
  assert.equal(migrated.parts[0].slots.length, 2, 'the heads survive migration');
  assert.equal(migrated.parts[0].mix.length, 2);
});

test('a single-spool request leaves heads unset, so it prices as one colour', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    printerId: 'bambu-x1e',
    parts: [selection()],
    customer: customer(),
    order: {},
    quotedTotal: null,
  });
  assert.equal(req.project.parts[0].mix, null, 'no mix on a one-colour part');
});

test('a structured address composes into the customer, keeping both forms', () => {
  const req = portalRequest({
    company: { name: 'Detronics' },
    printerId: 'bambu-x1e',
    parts: [selection()],
    customer: {
      name: 'Acme Robotics', email: 'buy@acme.test', phone: '011',
      addressParts: {
        type: 'complex', unit: '5', complex: 'Sunnyside', street: '10 Oak Ave',
        area: 'Rosebank', city: 'Johannesburg', province: 'Gauteng',
        postalCode: '2196', country: 'South Africa',
      },
    },
    order: {}, quotedTotal: null,
  });
  // The one-string address documents use is composed...
  assert.match(req.customer.address, /Unit 5, Sunnyside/);
  assert.match(req.customer.address, /Rosebank, Johannesburg/);
  // ...and the structured parts are kept intact for the workshop's editor.
  assert.equal(req.customer.addressParts.type, 'complex');
  assert.equal(req.customer.addressParts.postalCode, '2196');
});

test('an expedited request lands in awaiting payment with the paid figure on the workflow', () => {
  const req = portalRequest({
    company: { name: 'Detronics' }, printerId: 'bambu-x1e', parts: [selection()],
    customer: customer(), order: {}, quotedTotal: 972.5, currencyCode: 'ZAR', expedited: true,
  });
  assert.equal(req.expedited, true, 'the payload is flagged expedited');
  assert.equal(req.project.phase, 'awaiting-payment', 'it skips quotation');
  assert.equal(req.project.workflow.expedited, true);
  assert.equal(req.project.workflow.expeditedTotal, 972.5, 'the paid estimate is carried');
  assert.match(req.project.notes, /EXPEDITED/);

  const migrated = migrateProject(req.project);
  assert.equal(migrated.phase, 'awaiting-payment', 'the phase survives migration');
  assert.equal(migrated.workflow.expedited, true, 'and so does the expedite marker');
});

test('a normal request still starts in Quotation and is not expedited', () => {
  const req = portalRequest({
    company: { name: 'Detronics' }, printerId: 'bambu-x1e', parts: [selection()],
    customer: customer(), order: {}, quotedTotal: 500, currencyCode: 'ZAR',
  });
  assert.equal(req.expedited, false);
  assert.equal(req.project.phase, 'quotation');
});

test('the export carries its validity window', () => {
  const req = portalRequest({
    company: { name: 'Detronics' }, printerId: 'bambu-x1e', parts: [selection()],
    customer: customer(), order: {}, quotedTotal: 500, currencyCode: 'ZAR',
    validityDays: 30, now: Date.UTC(2026, 0, 1),
  });
  assert.equal(req.exportedAt, new Date(Date.UTC(2026, 0, 1)).toISOString());
  assert.equal(req.validUntil, new Date(Date.UTC(2026, 0, 31)).toISOString(), '30 days on');
  assert.match(req.project.notes, /valid until/i);
});
