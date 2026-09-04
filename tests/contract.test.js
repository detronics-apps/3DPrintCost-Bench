/**
 * The contract between what the code passes and what the styles honour.
 *
 * This is the class of bug that every happy-path test sails past, because the
 * fallback IS a valid render: `banner('danger', …)` falling through to a neutral
 * grey note throws nothing, logs nothing, and is simply wrong. The only test
 * that can see it reads BOTH sides — every value a caller passes must be one the
 * renderer actually honours.
 *
 * It found a real one: `tone: 'info'` was passed to `statTile` from three
 * status tables while the stylesheet had no `.stat--info` rule.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_STATUSES } from '../js/projects.js';
import { QUOTE_STATUSES, INVOICE_STATUSES } from '../js/documents.js';
import { ESTIMATE_LEVELS } from '../js/estimate.js';
import { LABOUR_SCOPES, DEFAULT_LABOUR_OPS } from '../js/labour.js';
import { MOVEMENT_REASONS } from '../js/inventory.js';
import { DEMAND_TARGETS, CHARGE_MODES, DISCOUNT_KINDS, DEFAULT_PRESETS } from '../js/pricing.js';
import { CALIBRATION_SCOPES } from '../js/calibration.js';
import { CAPACITY_SOURCES } from '../js/demand.js';
import { defaultSettings } from '../js/settings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const jsFiles = walk(join(root, 'js')).filter((f) => f.endsWith('.js'));
const jsSource = jsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
const css = ['components.css', 'layout.css', 'patterns.css', 'tokens.css', 'print.css']
  .map((f) => readFileSync(join(root, 'css', f), 'utf8')).join('\n');

/* -------------------------------------------------------------- banners -- */

test('every banner level a caller passes is one the styles honour', () => {
  const used = [...jsSource.matchAll(/\bbanner\('([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 3, `only ${used.length} banner calls found — is the regex still right?`);
  for (const level of new Set(used)) {
    assert.ok(css.includes(`.banner-${level}`),
      `banner('${level}') has no .banner-${level} rule, so it renders as nothing`);
  }
});

/* ---------------------------------------------------------------- tones -- */

test('every status tone has a pill style', () => {
  const all = [...PROJECT_STATUSES, ...QUOTE_STATUSES, ...INVOICE_STATUSES];
  for (const status of all) {
    assert.ok(css.includes(`.pill--${status.tone}`),
      `status "${status.id}" has tone "${status.tone}" and no .pill--${status.tone} rule`);
  }
});

test('every stat tone a caller passes has a style', () => {
  const used = [...jsSource.matchAll(/tone:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 5, `only ${used.length} tone: values found`);
  for (const tone of new Set(used)) {
    assert.ok(css.includes(`.stat--${tone}`),
      `tone "${tone}" is passed but there is no .stat--${tone} rule, so it renders neutral in silence`);
  }
});

/* -------------------------------------------------------------- classes -- */

test('every class the UI writes has a rule somewhere', () => {
  // Class names built by interpolation are excluded: they cannot be read
  // statically, and a false alarm here would train people to ignore this test.
  const used = new Set();
  for (const match of jsSource.matchAll(/class:\s*'([^'${}]+)'/g)) {
    for (const name of match[1].split(/\s+/)) if (name) used.add(name);
  }
  const missing = [...used].filter((name) => !css.includes(`.${name}`));
  assert.deepEqual(missing, [], `classes with no styling: ${missing.join(', ')}`);
});

/* ------------------------------------------------------------- controls -- */

test('every control carries a data-field name', () => {
  // Without it a rebuild throws away scroll, focus and caret, and the reader
  // experiences a control that does not work (pitfalls #21).
  const controls = readFileSync(join(root, 'js/ui/controls.js'), 'utf8');
  for (const factory of ['numberField', 'textField', 'selectField', 'checkField',
    'sliderField', 'button', 'chips']) {
    const at = controls.indexOf(`export function ${factory}`) >= 0
      ? controls.indexOf(`export function ${factory}`)
      : controls.indexOf(`export const ${factory}`);
    assert.ok(at >= 0, `${factory} is not exported from controls.js`);
    const body = controls.slice(at, at + 1600);
    assert.ok(body.includes("'data-field'"), `${factory} does not set data-field`);
  }
});

test('no control commits on input', () => {
  // The readout beside a slider may follow the thumb; the value is written on
  // change. Committing mid-drag rebuilds the panel under the pointer.
  const controls = readFileSync(join(root, 'js/ui/controls.js'), 'utf8');
  const inputHandlers = [...controls.matchAll(/input:\s*\(e\)\s*=>\s*\{([^}]*)\}/g)].map((m) => m[1]);
  for (const body of inputHandlers) {
    assert.ok(!/onChange/.test(body),
      `an input handler calls onChange, which destroys the control being dragged: ${body.trim()}`);
  }
});

/* ------------------------------------------------------------ catalogues -- */

test('every enum the UI offers is one the pure layer understands', () => {
  const settings = defaultSettings();

  for (const op of settings.labour.ops) {
    assert.ok(LABOUR_SCOPES.some((s) => s.id === op.per),
      `labour operation "${op.id}" scales per "${op.per}", which is not a scope`);
  }
  for (const op of DEFAULT_LABOUR_OPS) {
    assert.ok(op.group, `labour operation "${op.id}" has no group`);
  }
  assert.ok(DEMAND_TARGETS.some((t) => t.id === settings.thirds.demandTarget));
  assert.ok(CHARGE_MODES.some((m) => m.id === settings.handling.mode));
  assert.ok(CHARGE_MODES.some((m) => m.id === settings.storage.mode));
  assert.ok(DISCOUNT_KINDS.some((k) => k.id === settings.discount.kind));
  assert.ok(DEFAULT_PRESETS.some((p) => p.id === settings.presetId));
  assert.ok(CAPACITY_SOURCES.some((s) => s.id === settings.demand.capacitySource));
  assert.ok(ESTIMATE_LEVELS.some((l) => l.id === 'geometric'));
  for (const scope of CALIBRATION_SCOPES) assert.ok(scope.name, `${scope.id} has no name`);
  for (const r of MOVEMENT_REASONS) assert.ok(r.name, `${r.id} has no name`);
});

test('every default id the settings point at exists in its catalogue', () => {
  const s = defaultSettings();
  assert.ok(s.shipping.some((m) => m.id === s.defaultShippingId),
    `defaultShippingId "${s.defaultShippingId}" is not in the shipping catalogue`);
  assert.ok(s.countries.some((c) => c.id === s.countryId));
  for (const id of s.customerPortal.allowedProfiles) {
    assert.ok(s.profiles.some((p) => p.id === id),
      `the customer portal offers profile "${id}", which does not exist`);
  }
});

/* ------------------------------------------------------------- purity -- */

test('nothing under js/ except js/ui/ touches the DOM', () => {
  // The rule that makes the arithmetic testable without a browser, and the
  // first one to get violated in a hurry.
  // Property access, not the bare word: "Unknown document kind" in an error
  // message is prose, and a check that fires on prose teaches people to ignore
  // it. It still catches a shadowed parameter named `document`, which is why
  // documents.js calls its parameter `doc`.
  const forbidden = /\b(document|window|localStorage|navigator)\s*\.|getComputedStyle\s*\(/;
  const offenders = [];
  for (const file of jsFiles) {
    const relative = file.slice(root.length + 1).replace(/\\/g, '/');
    if (relative.startsWith('js/ui/')) continue;
    // state.js is the declared exception: persistence is where the browser has
    // to be touched, and it is kept as thin as possible.
    if (relative === 'js/state.js' || relative === 'js/main.js') continue;
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    if (forbidden.test(source)) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `these should be pure: ${offenders.join(', ')}`);
});

test('every pure module has a test file that imports it', () => {
  const tests = walk(join(root, 'tests')).filter((f) => f.endsWith('.test.js'))
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const missing = [];
  for (const file of jsFiles) {
    const relative = file.slice(root.length + 1).replace(/\\/g, '/');
    if (relative.startsWith('js/ui/') || relative === 'js/main.js' || relative === 'js/state.js') continue;
    const name = relative.slice('js/'.length);
    if (!tests.includes(`../js/${name}`)) missing.push(relative);
  }
  assert.deepEqual(missing, [], `pure modules with no test importing them: ${missing.join(', ')}`);
});
