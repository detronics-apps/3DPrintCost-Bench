/**
 * Material database. Pure.
 *
 * A material is chosen in TWO steps, because that is how a workshop thinks
 * about it: pick the plastic, then pick the colour. PLA, then White.
 *
 * Underneath, a catalogue entry is still one spool - a type AND a colour
 * together - because that is what you buy and what has a price. Generic
 * filament costs the same whatever colour it is, but a silk or a glow-in-the-
 * dark does not, so the price has to live on the combination rather than on the
 * plastic alone. The two-step choice is resolved to a spool by
 * `findByTypeAndColour`, and a combination you do not stock is reported rather
 * than quietly substituted.
 *
 * Prices are per country and are NOT interchangeable: a spool that is R350 in
 * Johannesburg is not "R350 converted" in Rotterdam, because the shipping,
 * import duty and local competition are all different. There is no exchange
 * rate anywhere in this app.
 *
 * Every price is indicative and dated. Overriding them is expected.
 */

import { num } from './money.js';
import { AS_OF } from './countries.js';

/** Density in g/cm3. These are physical constants, unlike the prices. */
export const MATERIAL_TYPES = [
  { id: 'PLA', name: 'PLA', density: 1.24, bed: 60, nozzle: 210, enclosure: false },
  { id: 'PLA-CF', name: 'PLA carbon-filled', density: 1.22, bed: 60, nozzle: 220, enclosure: false, abrasive: true },
  { id: 'PETG', name: 'PETG', density: 1.27, bed: 80, nozzle: 240, enclosure: false },
  { id: 'ABS', name: 'ABS', density: 1.04, bed: 100, nozzle: 250, enclosure: true },
  { id: 'ASA', name: 'ASA', density: 1.07, bed: 100, nozzle: 260, enclosure: true },
  { id: 'TPU', name: 'TPU 95A', density: 1.21, bed: 40, nozzle: 225, enclosure: false, flexible: true },
  { id: 'PA-CF', name: 'Nylon carbon-filled', density: 1.10, bed: 90, nozzle: 280, enclosure: true, abrasive: true, hygroscopic: true },
  { id: 'PC', name: 'Polycarbonate', density: 1.20, bed: 110, nozzle: 275, enclosure: true, hygroscopic: true },
];

export function materialType(id) {
  return MATERIAL_TYPES.find((m) => m.id === id)
    || MATERIAL_TYPES.find((m) => m.id === 'PLA');
}

/**
 * The colours the shipped catalogue stocks, per type.
 *
 * Only colours a generic supplier actually keeps on the shelf, and only at the
 * plain price. Silk, glow and translucent finishes cost more and vary by brand,
 * so they are not invented here - add them yourself with the price you pay.
 */
const SPOOL_TYPES = {
  PLA: {
    name: 'PLA Basic',
    prices: { ZA: 350, NL: 20, CN: 70, US: 20 },
    wasteFactor: 0.03,
    colours: ['Black', 'White', 'Dark Grey', 'Light Grey', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Natural'],
    storage: 'Dry, sealed, room temperature.',
  },
  'PLA-CF': {
    name: 'PLA-CF',
    prices: { ZA: 750, NL: 40, CN: 160, US: 40 },
    wasteFactor: 0.04,
    colours: ['Black', 'Dark Grey'],
    storage: 'Dry, sealed. Abrasive: hardened nozzle required.',
  },
  PETG: {
    name: 'PETG',
    prices: { ZA: 400, NL: 23, CN: 85, US: 23 },
    wasteFactor: 0.04,
    colours: ['Black', 'White', 'Dark Grey', 'Red', 'Blue', 'Green', 'Natural'],
    storage: 'Dry, sealed. Absorbs moisture faster than PLA.',
  },
  ABS: {
    name: 'ABS',
    prices: { ZA: 380, NL: 22, CN: 75, US: 22 },
    wasteFactor: 0.03,
    colours: ['Black', 'White', 'Grey', 'Red'],
    storage: 'Dry, sealed. Needs an enclosure to print without warping.',
  },
  ASA: {
    name: 'ASA',
    prices: { ZA: 550, NL: 30, CN: 110, US: 30 },
    wasteFactor: 0.03,
    colours: ['Black', 'White', 'Grey'],
    storage: 'Dry, sealed. UV stable once printed.',
  },
  TPU: {
    name: 'TPU 95A',
    prices: { ZA: 650, NL: 35, CN: 130, US: 35 },
    wasteFactor: 0.05,
    colours: ['Black', 'White', 'Red', 'Clear'],
    storage: 'Dry, sealed. Dries out slowly; print from a dry box.',
  },
  'PA-CF': {
    name: 'PA-CF',
    prices: { ZA: 1400, NL: 70, CN: 300, US: 70 },
    wasteFactor: 0.06,
    colours: ['Black'],
    storage: 'Dried before every use; stored with desiccant. Abrasive.',
  },
  PC: {
    name: 'Polycarbonate',
    prices: { ZA: 800, NL: 40, CN: 150, US: 40 },
    wasteFactor: 0.05,
    colours: ['Clear', 'Black', 'White'],
    storage: 'Dried before use; stored with desiccant.',
  },
};

/**
 * The id of a spool.
 *
 * Deterministic, so the id for PLA + Dark Grey is `pla-dark-grey` however it
 * was created. That is what lets the catalogue be generated from a table
 * without breaking a project saved before it was.
 */
export const spoolId = (type, colour) => `${String(type)}-${String(colour)}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function buildSpool(type, colour) {
  const spec = SPOOL_TYPES[type];
  return {
    id: spoolId(type, colour),
    name: spec.name,
    type,
    colour,
    manufacturer: 'Generic',
    diameter: 1.75,
    spoolWeight: 1000,
    wasteFactor: spec.wasteFactor,
    prices: { ...spec.prices },
    storage: spec.storage,
    archived: false,
    asOf: AS_OF,
  };
}

export const DEFAULT_MATERIALS = Object.entries(SPOOL_TYPES)
  .flatMap(([type, spec]) => spec.colours.map((colour) => buildSpool(type, colour)));

/** A spool for a type and colour that is not in the catalogue yet. */
export function makeSpoolEntry(type, colour, { price = null } = {}) {
  const spec = SPOOL_TYPES[type];
  if (!spec) {
    return {
      id: spoolId(type, colour),
      name: materialType(type).name,
      type,
      colour,
      manufacturer: '',
      diameter: 1.75,
      spoolWeight: 1000,
      wasteFactor: 0.03,
      prices: {},
      storage: '',
      archived: false,
      asOf: AS_OF,
      estimated: true,
    };
  }
  const entry = buildSpool(type, colour);
  // Priced from the plain spool of the same plastic, and flagged: a colour you
  // have not bought yet has an assumed price, not a known one.
  return { ...entry, priceOverride: price, estimated: true };
}

/* -------------------------------------------------------- two-step choice -- */

export const live = (materials) => (materials || []).filter((m) => !m.archived);

/** The plastics the catalogue actually stocks, in the table's own order. */
export function typesInStock(materials) {
  const have = new Set(live(materials).map((m) => m.type));
  return MATERIAL_TYPES.filter((t) => have.has(t.id));
}

/** The colours stocked for one plastic. */
export function coloursForType(materials, type) {
  const seen = new Set();
  const out = [];
  for (const m of live(materials)) {
    if (m.type !== type || seen.has(m.colour)) continue;
    seen.add(m.colour);
    out.push(m.colour);
  }
  return out;
}

/** Every colour name anywhere in the catalogue, for a free-text picker. */
export function colourNames(materials) {
  return [...new Set(live(materials).map((m) => m.colour))].sort();
}

/**
 * The spool for a plastic and a colour.
 *
 * `null` when that combination is not stocked. The caller must say so rather
 * than falling back to another colour - quoting White and printing Red because
 * White was missing is exactly the kind of silent substitution this app is
 * meant not to do.
 */
export function findByTypeAndColour(materials, type, colour) {
  return live(materials).find((m) => m.type === type && m.colour === colour) || null;
}

/**
 * Resolve a two-step choice to a spool.
 *
 * Returns what it found AND what it had to change, so the UI can tell the
 * reader their colour was not available rather than silently moving them.
 */
export function resolveSpool(materials, { type, colour }) {
  const exact = findByTypeAndColour(materials, type, colour);
  if (exact) return { material: exact, type, colour, changed: null };

  const available = coloursForType(materials, type);
  if (available.length) {
    const fallback = findByTypeAndColour(materials, type, available[0]);
    return {
      material: fallback,
      type,
      colour: available[0],
      changed: 'colour',
      wanted: colour,
    };
  }

  // Nothing of this plastic at all: keep the colour and move the plastic.
  const anyOfColour = live(materials).find((m) => m.colour === colour);
  if (anyOfColour) {
    return { material: anyOfColour, type: anyOfColour.type, colour, changed: 'type', wanted: type };
  }
  const first = live(materials)[0] || null;
  return first
    ? { material: first, type: first.type, colour: first.colour, changed: 'both', wanted: `${type} ${colour}` }
    : { material: null, type, colour, changed: 'missing' };
}

/* ------------------------------------------------------------- pricing -- */

/**
 * The spool price in a given country.
 *
 * Returns `null` rather than a converted guess when the country has no price.
 * A missing price is a real fact the user should be told about.
 */
export function spoolPrice(m, countryId) {
  if (!m) return null;
  if (m.priceOverride != null && num(m.priceOverride, -1) >= 0) return num(m.priceOverride);
  const price = m.prices?.[countryId];
  return price == null ? null : num(price);
}

export function pricePerKg(m, countryId) {
  const price = spoolPrice(m, countryId);
  if (price == null) return null;
  const weight = Math.max(1, num(m.spoolWeight, 1000));
  return price * (1000 / weight);
}

export function pricePerGram(m, countryId) {
  const perKg = pricePerKg(m, countryId);
  return perKg == null ? null : perKg / 1000;
}

/** Density of the spool's plastic, in g/cm3. */
export function density(m) {
  return num(materialType(m?.type).density, 1.24);
}

/** Grams for a printed volume in mm3. 1000 mm3 is 1 cm3. */
export function gramsFor(volumeMm3, m) {
  return (num(volumeMm3) / 1000) * density(m);
}

/** Named fallback, never positional. */
export function findMaterial(materials, id) {
  return materials.find((m) => m.id === id)
    || materials.find((m) => m.id === 'pla-dark-grey')
    || materials[0];
}

/** Everything in the catalogue that is this plastic and not archived. */
export function materialsOfType(materials, type) {
  return live(materials).filter((m) => !type || m.type === type);
}

/** `PLA · White`, the way the two-step choice reads back. */
export function materialLabel(m) {
  if (!m) return '—';
  return `${materialType(m.type).name} · ${m.colour}`;
}
