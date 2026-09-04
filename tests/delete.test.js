/**
 * Deleting a catalogue entry for good.
 *
 * Archive is the safe default; Delete is the escape hatch for a mistake. The one
 * property that needs proving at this layer is that a deletion STICKS: the
 * upgrade-migration re-adds any shipped default that is missing, so a deleted
 * default must be recorded as removed or it silently comes back on the next load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateSettings, defaultSettings } from '../js/settings.js';
import { DEFAULT_HARDWARE } from '../js/packaging.js';

test('hardware carries a logistics part number, blank until set', () => {
  const hw = defaultSettings().hardware[0];
  assert.ok('partNumber' in hw, 'every hardware entry has the field');
  assert.equal(hw.partNumber, '', 'and it starts blank');
});

test('a deleted shipped default is NOT re-added when it is tombstoned', () => {
  const s = defaultSettings();
  const victim = s.materials.find((m) => m.id === 'petg-dark-grey');
  assert.ok(victim, 'the shipped material exists to begin with');

  // Simulate the delete: drop it from the list and record the tombstone.
  s.materials = s.materials.filter((m) => m.id !== 'petg-dark-grey');
  s.removed = { materials: ['petg-dark-grey'] };

  const migrated = migrateSettings(s);
  assert.ok(!migrated.materials.some((m) => m.id === 'petg-dark-grey'),
    'the tombstoned default stays gone through a migration');
});

test('without a tombstone, a missing shipped default IS restored (the behaviour we protect against)', () => {
  const s = defaultSettings();
  s.materials = s.materials.filter((m) => m.id !== 'petg-dark-grey');
  // No tombstone this time.
  const migrated = migrateSettings(s);
  assert.ok(migrated.materials.some((m) => m.id === 'petg-dark-grey'),
    'the migration tops shipped defaults back up — which is why Delete needs the tombstone');
});

test('a custom entry is not a shipped default, so tombstoning it is harmless and it stays gone', () => {
  const s = defaultSettings();
  s.hardware.push({ ...DEFAULT_HARDWARE[0], id: 'hw-custom-1', name: 'My widget', partNumber: 'LOG-001' });
  // Delete it.
  s.hardware = s.hardware.filter((h) => h.id !== 'hw-custom-1');
  s.removed = { hardware: ['hw-custom-1'] };
  const migrated = migrateSettings(s);
  assert.ok(!migrated.hardware.some((h) => h.id === 'hw-custom-1'), 'the custom entry stays deleted');
  // And the tombstone never resurrects it as a phantom shipped entry.
  assert.equal(migrated.removed.hardware[0], 'hw-custom-1');
});
