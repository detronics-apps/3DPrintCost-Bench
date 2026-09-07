/**
 * Email and lenient, country-aware phone validation for the client form.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePhone, dialCodeFor, dialInfoFor } from '../js/phone.js';

/* --------------------------------------------------------------- email ---- */

test('email accepts a normal address and trims it', () => {
  const r = validateEmail('  Sam@Example.com ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'Sam@Example.com');
});

test('email rejects junk and an empty value, each with a message', () => {
  assert.equal(validateEmail('not-an-email').ok, false);
  assert.equal(validateEmail('a@b').ok, false, 'no dot in the domain');
  assert.equal(validateEmail('').ok, false);
  assert.ok(validateEmail('').message);
});

/* --------------------------------------------------------------- phone ---- */

test('dial codes are known for the supported countries', () => {
  assert.equal(dialCodeFor('ZA'), '27');
  assert.equal(dialCodeFor('NL'), '31');
  assert.equal(dialCodeFor('US'), '1');
  assert.equal(dialInfoFor('ZZ').code, '', 'unknown country is a safe blank');
});

test('a South African local number normalises to +27', () => {
  const r = validatePhone('082 123 4567', 'ZA');
  assert.equal(r.ok, true);
  assert.equal(r.value, '+27821234567', 'the leading 0 becomes the country code');
});

test('an already-international number is kept', () => {
  assert.equal(validatePhone('+27 82 123 4567', 'ZA').value, '+27821234567');
  assert.equal(validatePhone('0027821234567', 'ZA').value, '+27821234567', '00 is a written +');
});

test('a bare local number without a trunk prefix gets the country code', () => {
  assert.equal(validatePhone('82 123 4567', 'ZA').value, '+27821234567');
});

test('a US ten-digit number gets +1', () => {
  assert.equal(validatePhone('(555) 123-4567', 'US').value, '+15551234567');
});

test('too few or too many digits is rejected', () => {
  assert.equal(validatePhone('123', 'ZA').ok, false);
  assert.equal(validatePhone('012345678901234567', 'ZA').ok, false);
  assert.equal(validatePhone('', 'ZA').ok, false);
});

test('a wrong national-number length is blocked with the expected count', () => {
  // ZA national numbers are 9 digits; 7 or 11 are rejected, 9 accepted.
  assert.equal(validatePhone('082 1234', 'ZA').ok, false, 'too short');
  assert.equal(validatePhone('082 123 456 789', 'ZA').ok, false, 'too long');
  assert.match(validatePhone('082 1234', 'ZA').message, /9 digits/);
  assert.equal(validatePhone('082 123 4567', 'ZA').ok, true, 'exactly nine is fine');
  // US is 10.
  assert.equal(validatePhone('555 123 456', 'US').ok, false, 'nine is too short for US');
  assert.equal(validatePhone('555 123 4567', 'US').ok, true);
});
