import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideMatches } from '../js/ui/tools/guide.js';

test('user language finds the app term (local save → team sync)', () => {
  const text = 'Team sync keeps a live copy in a shared file on Google Drive or OneDrive.';
  assert.ok(guideMatches(text, 'local save'), '"local save" should find the team-sync page');
  assert.ok(guideMatches(text, 'cloud'), 'so should "cloud"');
  assert.ok(guideMatches(text, 'autosave'), 'and "autosave"');
});

test('everyday phrases find the right page', () => {
  assert.ok(guideMatches('Reorder points warn you before a spool runs out.', 'ran out of filament'));
  assert.ok(guideMatches('The customer portal is a client-facing form.', 'client form'));
  assert.ok(guideMatches('Post-processing covers support removal and resin coat.', 'finishing'));
});

test('an unrelated query still does not match', () => {
  assert.equal(guideMatches('Team sync keeps a shared file.', 'nozzle temperature'), false);
});

test('the plain match still works and an empty query matches all', () => {
  assert.ok(guideMatches('Anything at all', ''));
  assert.ok(guideMatches('Create a quotation', 'quotation'));
});
