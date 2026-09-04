/**
 * Choosing a material in two steps: the plastic, then the colour.
 *
 * The thing that matters most here is that a combination you do not stock is
 * REPORTED rather than substituted. Quoting White and printing Red because
 * White was missing is the exact class of silent fallback this app is built to
 * avoid, and it would be invisible on every happy path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MATERIALS, MATERIAL_TYPES, spoolId, makeSpoolEntry, typesInStock,
  coloursForType, colourNames, findByTypeAndColour, resolveSpool, findMaterial,
  materialType, materialsOfType, materialLabel, pricePerGram, spoolPrice, gramsFor,
  density, live,
} from '../js/materials.js';
import { defaultSettings } from '../js/settings.js';
import { calculateOrder } from '../js/engine.js';
import { analyse } from '../js/geometry.js';
import { box } from './helpers/solids.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol,
  `${what}: got ${a}, expected ${b} ± ${tol}`);

/* ------------------------------------------------------- id stability ---- */

test('every id the app shipped before the split still exists', () => {
  // The catalogue is generated from a table now. If the generated ids differ
  // from the hand-written ones, every saved project and share link breaks
  // silently — the part keeps an id nothing resolves.
  const ids = new Set(DEFAULT_MATERIALS.map((m) => m.id));
  for (const id of ['pla-dark-grey', 'pla-white', 'pla-red', 'pla-blue',
    'pla-cf-dark-grey', 'petg-dark-grey', 'abs-black', 'asa-black', 'tpu-black',
    'pa-cf-black', 'pc-clear']) {
    assert.ok(ids.has(id), `${id} no longer exists, so anything referencing it is orphaned`);
  }
});

test('ids are derived from the pair, so the same pair always gives the same id', () => {
  assert.equal(spoolId('PLA', 'Dark Grey'), 'pla-dark-grey');
  assert.equal(spoolId('PLA-CF', 'Dark Grey'), 'pla-cf-dark-grey');
  assert.equal(spoolId('PC', 'Clear'), 'pc-clear');
  assert.equal(spoolId('PETG', 'Light  Grey'), 'petg-light-grey');
  for (const m of DEFAULT_MATERIALS) {
    assert.equal(m.id, spoolId(m.type, m.colour), `${m.id} does not match its own pair`);
  }
});

test('no two spools share an id', () => {
  const ids = DEFAULT_MATERIALS.map((m) => m.id);
  assert.equal(ids.length, new Set(ids).size);
});

/* ------------------------------------------------------- the two steps ---- */

test('the plastics on offer are the ones actually stocked', () => {
  const stocked = typesInStock(DEFAULT_MATERIALS).map((t) => t.id);
  assert.deepEqual(stocked, MATERIAL_TYPES.map((t) => t.id),
    'the shipped catalogue stocks every plastic in the table');

  const thin = DEFAULT_MATERIALS.filter((m) => m.type === 'PLA');
  assert.deepEqual(typesInStock(thin).map((t) => t.id), ['PLA']);
});

test('colours are listed per plastic, not globally', () => {
  const pla = coloursForType(DEFAULT_MATERIALS, 'PLA');
  const paCf = coloursForType(DEFAULT_MATERIALS, 'PA-CF');

  assert.ok(pla.includes('White'), 'PLA is stocked in white');
  assert.ok(pla.length > 5, `only ${pla.length} PLA colours`);
  assert.deepEqual(paCf, ['Black'], 'filled nylon comes in one colour');
  assert.ok(!paCf.includes('White'), 'the global colour list must not leak into a plastic');
});

test('picking PLA then White resolves to one spool', () => {
  const spool = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'White');
  assert.equal(spool.id, 'pla-white');
  assert.equal(spool.type, 'PLA');
  assert.equal(spool.colour, 'White');
  assert.equal(materialLabel(spool), 'PLA · White');
});

test('a combination that is not stocked comes back null, not another colour', () => {
  assert.equal(findByTypeAndColour(DEFAULT_MATERIALS, 'PETG', 'Orange'), null);
  assert.equal(findByTypeAndColour(DEFAULT_MATERIALS, 'PA-CF', 'White'), null);
  assert.equal(findByTypeAndColour(DEFAULT_MATERIALS, 'NOPE', 'White'), null);
});

test('an archived spool is not offered in either step', () => {
  const edited = DEFAULT_MATERIALS.map((m) => (m.id === 'pla-white' ? { ...m, archived: true } : m));
  assert.ok(!coloursForType(edited, 'PLA').includes('White'));
  assert.equal(findByTypeAndColour(edited, 'PLA', 'White'), null);
  assert.ok(!live(edited).some((m) => m.id === 'pla-white'));
});

test('resolveSpool says what it had to change, and never changes in silence', () => {
  const exact = resolveSpool(DEFAULT_MATERIALS, { type: 'PLA', colour: 'White' });
  assert.equal(exact.material.id, 'pla-white');
  assert.equal(exact.changed, null, 'an exact hit changed nothing');

  const noColour = resolveSpool(DEFAULT_MATERIALS, { type: 'PETG', colour: 'Orange' });
  assert.equal(noColour.changed, 'colour');
  assert.equal(noColour.wanted, 'Orange');
  assert.equal(noColour.material.type, 'PETG', 'it kept the plastic that was asked for');

  const noType = resolveSpool(DEFAULT_MATERIALS, { type: 'NOPE', colour: 'Red' });
  assert.equal(noType.changed, 'type');
  assert.equal(noType.material.colour, 'Red', 'it kept the colour that was asked for');

  const nothing = resolveSpool([], { type: 'PLA', colour: 'White' });
  assert.equal(nothing.material, null);
  assert.equal(nothing.changed, 'missing');
});

/* --------------------------------------------------------- adding one ---- */

test('a colour you do not stock can be added, priced from the plain spool', () => {
  const entry = makeSpoolEntry('PETG', 'Orange');
  assert.equal(entry.id, 'petg-orange');
  assert.equal(entry.type, 'PETG');
  assert.equal(entry.colour, 'Orange');
  assert.equal(entry.estimated, true, 'a colour you have not bought has an assumed price');

  const catalogue = [...DEFAULT_MATERIALS, entry];
  assert.equal(findByTypeAndColour(catalogue, 'PETG', 'Orange').id, 'petg-orange');
  close(pricePerGram(entry, 'ZA'), pricePerGram(findByTypeAndColour(DEFAULT_MATERIALS, 'PETG', 'Black'), 'ZA'),
    1e-12, 'it costs what the plain spool of the same plastic costs');
});

test('adding an unknown plastic does not invent a price for it', () => {
  const entry = makeSpoolEntry('UNOBTAINIUM', 'Gold');
  assert.equal(spoolPrice(entry, 'ZA'), null, 'a plastic the app knows nothing about has no price');
  assert.equal(entry.estimated, true);
});

/* -------------------------------------------------- prices and density --- */

test('every shipped spool is priced in every country', () => {
  const countries = ['ZA', 'NL', 'CN', 'US'];
  for (const m of DEFAULT_MATERIALS) {
    for (const id of countries) {
      assert.ok(spoolPrice(m, id) > 0, `${m.id} has no ${id} price`);
    }
  }
});

test('colour does not change the price of generic filament, and plastic does', () => {
  const white = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'White');
  const red = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'Red');
  const petg = findByTypeAndColour(DEFAULT_MATERIALS, 'PETG', 'White');

  close(pricePerGram(white, 'ZA'), pricePerGram(red, 'ZA'), 1e-12,
    'generic PLA costs the same whatever colour it is');
  assert.ok(pricePerGram(petg, 'ZA') > pricePerGram(white, 'ZA'),
    'PETG costs more than PLA, and that is a property of the plastic');
});

test('density follows the plastic, not the colour', () => {
  const white = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'White');
  const black = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'Black');
  const petg = findByTypeAndColour(DEFAULT_MATERIALS, 'PETG', 'Black');

  assert.equal(density(white), density(black));
  close(density(white), 1.24, 1e-12, 'PLA');
  close(density(petg), 1.27, 1e-12, 'PETG');
  close(gramsFor(1000, white), 1.24, 1e-12, 'a cm³ of PLA');
});

test('a price override beats the catalogue, and a missing country price is null', () => {
  const base = findByTypeAndColour(DEFAULT_MATERIALS, 'PLA', 'White');
  assert.equal(spoolPrice({ ...base, priceOverride: 275 }, 'ZA'), 275);
  assert.equal(spoolPrice({ ...base, prices: { ZA: 350 } }, 'NL'), null);
});

/* ------------------------------------------------------------ the app ---- */

test('changing only the colour changes nothing about the price of a part', () => {
  const settings = defaultSettings();
  const base = {
    quantity: 4,
    profileId: 'function',
    printerId: 'bambu-x1e',
    geometry: analyse(box(50, 50, 20)),
    hardware: [],
    colours: 1,
  };
  const white = calculateOrder({ lines: [{ ...base, materialId: 'pla-white' }] }, settings);
  const red = calculateOrder({ lines: [{ ...base, materialId: 'pla-red' }] }, settings);

  close(white.totals.costToCompany, red.totals.costToCompany, 1e-9,
    'white and red PLA cost the same to print');
  assert.equal(white.lines[0].material.colour, 'White');
  assert.equal(red.lines[0].material.colour, 'Red');
});

test('changing the plastic changes the price, through density and spool cost', () => {
  const settings = defaultSettings();
  const base = {
    quantity: 4,
    profileId: 'function',
    printerId: 'bambu-x1e',
    geometry: analyse(box(50, 50, 20)),
    hardware: [],
    colours: 1,
  };
  const pla = calculateOrder({ lines: [{ ...base, materialId: 'pla-black' }] }, settings);
  const petg = calculateOrder({ lines: [{ ...base, materialId: 'petg-black' }] }, settings);

  assert.ok(petg.lines[0].production.material > pla.lines[0].production.material,
    'PETG is both denser and dearer, so it must cost more');
  assert.ok(petg.lines[0].estimate.grams > pla.lines[0].estimate.grams,
    'and the same volume weighs more');
});

test('the whole catalogue prices without a NaN, whatever the pair', () => {
  const settings = defaultSettings();
  const geometry = analyse(box(40, 30, 20));
  for (const m of DEFAULT_MATERIALS) {
    const result = calculateOrder({
      lines: [{
        quantity: 1,
        profileId: 'function',
        printerId: 'bambu-x1e',
        materialId: m.id,
        geometry,
        hardware: [],
        colours: 1,
      }],
    }, settings);
    assert.ok(Number.isFinite(result.totals.finalInvoice), `${m.id} gave a non-finite invoice`);
    assert.ok(result.totals.costToCompany > 0, `${m.id} gave a zero cost`);
  }
});

test('an orphaned material id falls back by name and is not a crash', () => {
  const settings = defaultSettings();
  const result = calculateOrder({
    lines: [{
      quantity: 1,
      profileId: 'function',
      printerId: 'bambu-x1e',
      materialId: 'a-spool-that-was-deleted',
      geometry: analyse(box(40, 30, 20)),
      hardware: [],
      colours: 1,
    }],
  }, settings);
  assert.equal(findMaterial(settings.materials, 'nope').id, 'pla-dark-grey');
  assert.ok(Number.isFinite(result.totals.finalInvoice));
});

test('helpers used by the catalogue screen still behave', () => {
  assert.ok(colourNames(DEFAULT_MATERIALS).includes('Dark Grey'));
  assert.ok(materialsOfType(DEFAULT_MATERIALS, 'PLA').every((m) => m.type === 'PLA'));
  assert.equal(materialType('nope').id, 'PLA', 'an unknown plastic falls back by name');
  assert.equal(materialLabel(null), '—');
});
