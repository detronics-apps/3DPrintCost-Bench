/**
 * Company settings: every default in one place, with a version and a migration.
 * Pure.
 *
 * Settings outlive the code. They are in localStorage, in exported project
 * files and in share links, and every one of those can be older than the
 * running build. So there is exactly one way in - `migrateSettings` - and it
 * defaults anything absent rather than spreading a stored slice over the
 * defaults, because a stored key explicitly set to `undefined` overwrites a
 * perfectly good default (pitfalls #8).
 */

import { num } from './money.js';
import { DEFAULT_COUNTRIES, DEFAULT_COUNTRY_ID, findCountry } from './countries.js';
import { DEFAULT_PRINTERS } from './printers.js';
import { DEFAULT_MATERIALS } from './materials.js';
import { DEFAULT_PROFILES, DEFAULT_FACTOR_MODEL } from './profiles.js';
import { DEFAULT_LABOUR_OPS } from './labour.js';
import { DEFAULT_SHIPPING, DEFAULT_FREE_SHIPPING } from './shipping.js';
import { DEFAULT_PACKAGING, DEFAULT_HARDWARE } from './packaging.js';
import { DEFAULT_DEMAND } from './demand.js';
import {
  DEFAULT_THIRDS, DEFAULT_ALLOCATIONS, DEFAULT_VOLUME_TIERS, DEFAULT_PRESETS,
} from './pricing.js';
import { DEFAULT_ESTIMATE_ASSUMPTIONS } from './estimate.js';

export const SETTINGS_VERSION = 1;

/** A deep clone that does not need structuredClone, so tests and browser agree. */
export const clone = (value) => JSON.parse(JSON.stringify(value));

export function defaultSettings() {
  const country = findCountry(DEFAULT_COUNTRIES, DEFAULT_COUNTRY_ID);
  return {
    version: SETTINGS_VERSION,

    company: {
      name: 'Your workshop',
      registration: '',
      vatNumber: '',
      email: '',
      phone: '',
      address: '',
      terms: 'Payment due on invoice. Parts remain the property of the seller '
        + 'until paid for in full.',
      quoteValidityDays: 30,
      handlingDays: 1,
      // Branding for the printed quote and invoice, so any company can make the
      // documents their own. `logo` is a data URI (nothing is uploaded); the
      // accent colour tints the headings and the totals rule.
      logo: null,
      accentColour: '#1f6feb',
    },

    countryId: DEFAULT_COUNTRY_ID,
    currencyCode: country.currency,
    electricityAlternativeId: null,
    countries: clone(DEFAULT_COUNTRIES),

    tax: {
      enabled: false,
      rate: country.vatRate,
      name: country.vatName,
      inclusive: country.pricesIncludeVat,
    },

    printers: clone(DEFAULT_PRINTERS),
    materials: clone(DEFAULT_MATERIALS),
    profiles: clone(DEFAULT_PROFILES),
    shipping: clone(DEFAULT_SHIPPING),
    packaging: clone(DEFAULT_PACKAGING),
    hardware: clone(DEFAULT_HARDWARE),

    // Finishing steps that happen AFTER the print, on the parts that survived.
    // Resin coats the top surface, so its cost and its labour scale with the
    // top area; curing is unattended station time. NFC coding is the labour of
    // programming a tag that was embedded during the print.
    postProcessing: {
      resin: {
        minutesPerCm2: 0.5, // labour to brush/pour resin over a cm² of top area
        costPerCm2: 0,      // resin consumed per cm² of coverage, in money
        curingMinutes: 15,  // unattended cure per part - station time, not labour
      },
      nfc: {
        codingMinutes: 2,   // labour to program and verify one tag
      },
    },

    // Manual colour swaps: a plate reaching more colours than the machine's
    // heads by pausing at a height and swapping a spool by hand. Each swap is
    // labour plus a stretch of the machine sitting paused until someone gets to
    // it - and any swap makes the plate attended-only (no overnight running).
    colour: {
      swapLabourMinutes: 3,
      swapWaitMinutes: 20,
    },

    labour: {
      // How the hourly rate is arrived at:
      //   'direct'  rate is typed in below; 0 means "use the country default".
      //   'salary'  rate is computed from a monthly cost of employment and the
      //             share of paid hours that are actually billable.
      rateMode: 'direct',
      rate: 0,                       // 0 means "use the country default"
      salary: {
        monthly: 0,                  // full monthly cost of employing the person
        hoursPerMonth: 160,          // paid working hours in a month (~40h/wk)
        billablePercent: 0.7,        // fraction of those hours charged to jobs
      },
      ops: clone(DEFAULT_LABOUR_OPS),
    },

    factorModel: clone(DEFAULT_FACTOR_MODEL),
    estimate: {
      method: 'auto',
      assumptions: clone(DEFAULT_ESTIMATE_ASSUMPTIONS),
      idleMinutesPerJob: 15,
    },

    ctc: {
      generalAllowance: 0.10,
      otherDirectPerPart: 0,
    },
    scrap: {
      mode: 'percent',
      rate: 0.10,
      minimumSamples: 10,
    },

    thirds: clone(DEFAULT_THIRDS),
    allocations: clone(DEFAULT_ALLOCATIONS),
    demand: clone(DEFAULT_DEMAND),
    volumeTiers: clone(DEFAULT_VOLUME_TIERS),
    discount: { kind: 'none' },
    presets: clone(DEFAULT_PRESETS),
    presetId: 'standard',

    freeShipping: clone(DEFAULT_FREE_SHIPPING),
    defaultShippingId: 'pudo-s',
    handling: { mode: 'allocation', rate: 0.02 },
    storage: { mode: 'allocation', method: 'percent', rate: 0.05, perLitrePerMonth: 12, months: 1, perBin: 20, unitsPerBin: 10 },

    capacity: { machineHoursPerDay: 16 },

    customerPortal: {
      enabled: false,
      showBreakdown: false,
      allowedProfiles: ['function', 'strength', 'visual', 'display'],
      allowedPrinters: [],
      allowedMaterials: [],
      minimumOrder: 150,
      allowExpress: true,
      leadTimeNote: 'Lead time is confirmed once the model has been reviewed.',
      // The customer-facing quote is deliberately padded so the real invoice,
      // priced from the sliced part, comes in at or under it - a good surprise
      // rather than a bad one. This is the fraction added on top of the estimate.
      quoteBuffer: 0.1,
    },

    // How the production schedule turns machine-hours into days. `hoursPerDay`
    // is the run-hours a printer clears in a day - attended setup plus the long
    // unattended stretches - and a printer may override it with its own.
    scheduler: {
      hoursPerDay: 12,
      // When a risk assessment (HIRA) is in place that makes unattended overnight
      // printing safe, the long jobs are the ones worth leaving to run through the
      // night. This puts the longest prints first in each machine's queue so they
      // fall into the overnight stretch; off, the queue keeps its plain order.
      overnightLongPrints: false,
    },

    numbering: {
      projectPrefix: 'P',
      quotePrefix: 'Q',
      invoicePrefix: 'INV',
      nextProject: 1,
      nextQuote: 1,
      nextInvoice: 1,
      pad: 4,
    },

    ui: {
      mode: 'simple',
      sections: {},
    },

    // Catalogue entries the user has DELETED for good, by catalogue key. The
    // upgrade-migration re-adds any shipped default that is missing, so without
    // this a deleted default would quietly come back on the next load. A
    // tombstone here tells the migration to leave it gone.
    removed: {},
  };
}

/**
 * Merge stored settings over the defaults.
 *
 * Objects merge key by key; ARRAYS DO NOT. A catalogue the user has edited
 * replaces the shipped one outright - merging element by element would
 * resurrect a printer they deleted and renumber the rest.
 */
function mergeInto(base, incoming) {
  if (incoming === null || incoming === undefined) return base;
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (typeof base !== 'object') return incoming;
  if (typeof incoming !== 'object') return base;

  const out = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;                 // never overwrite with undefined
    out[key] = key in base ? mergeInto(base[key], value) : value;
  }
  return out;
}

/**
 * The one way settings enter the app.
 *
 * Every migration step is named and keyed on the stored version, so a file from
 * any past build lands on a settings object this build understands.
 */
export function migrateSettings(stored) {
  const defaults = defaultSettings();
  if (!stored || typeof stored !== 'object') return defaults;

  let raw = clone(stored);
  const from = num(raw.version, 0);

  // v0 -> v1: the first shipped shape. Earlier drafts kept a single
  // `markupPercent`; the rule of thirds replaced it, and a stored markup is
  // translated into an equivalent commercial share rather than dropped.
  if (from < 1) {
    if (raw.markupPercent != null) {
      const multiple = 1 + num(raw.markupPercent) / 100;
      const commercial = Math.max(0, multiple - 1);
      raw.thirds = {
        ...defaults.thirds,
        commercialShare: commercial / 2,
        profitShare: commercial / 2,
      };
      delete raw.markupPercent;
    }
    raw.version = 1;
  }

  const merged = mergeInto(defaults, raw);
  merged.version = SETTINGS_VERSION;

  // Repairs that have to happen however the object arrived. The check is an
  // exact lookup, not findCountry: findCountry always answers with something,
  // so asking it whether an id exists is a question it cannot say no to.
  if (!merged.countries.some((c) => c.id === merged.countryId)) {
    merged.countryId = DEFAULT_COUNTRY_ID;
    merged.currencyCode = null;
  }
  if (!merged.currencyCode) merged.currencyCode = findCountry(merged.countries, merged.countryId).currency;
  if (!Array.isArray(merged.labour?.ops) || merged.labour.ops.length === 0) {
    merged.labour = { ...merged.labour, ops: clone(DEFAULT_LABOUR_OPS) };
  }
  // The salary-based rate is newer than the labour block. Fill it in rather than
  // leave a stored workshop with no way to switch modes, and never let a stray
  // value stand in for the mode.
  if (!merged.labour.salary || typeof merged.labour.salary !== 'object') {
    merged.labour.salary = clone(defaults.labour.salary);
  }
  if (merged.labour.rateMode !== 'salary' && merged.labour.rateMode !== 'direct') {
    merged.labour.rateMode = 'direct';
  }

  // Every catalogue the engine looks something up in. An empty one is a real
  // state - a user can delete the last entry, and a share link can arrive with
  // one missing - and the lookups fall back to `list[0]`, which is `undefined`
  // for an empty list. That reached the engine as `material.type` and threw.
  // The repair belongs here, at the one place settings enter the app, and it
  // is written as a loop so nobody has to remember to extend it in two files.
  const CATALOGUES = {
    countries: DEFAULT_COUNTRIES,
    profiles: DEFAULT_PROFILES,
    printers: DEFAULT_PRINTERS,
    materials: DEFAULT_MATERIALS,
    shipping: DEFAULT_SHIPPING,
    packaging: DEFAULT_PACKAGING,
    hardware: DEFAULT_HARDWARE,
    allocations: DEFAULT_ALLOCATIONS,
    volumeTiers: DEFAULT_VOLUME_TIERS,
    presets: DEFAULT_PRESETS,
  };
  for (const [key, shipped] of Object.entries(CATALOGUES)) {
    if (!Array.isArray(merged[key]) || merged[key].length === 0) merged[key] = clone(shipped);
  }

  // Newly shipped catalogue entries reach a workshop that already exists.
  //
  // Nothing in this app deletes a catalogue entry: the editor archives, which
  // leaves the entry in the list with `archived: true`. So an id that is ABSENT
  // was never shipped to this user, and adding it cannot resurrect something
  // they got rid of. Without this, a workshop set up last month would never see
  // a colour, a printer or a shipping method added since — the arrays merge
  // wholesale, and theirs wins.
  //
  // Deliberately not applied to `allocations`, `volumeTiers` or `presets`:
  // those are weights and rules the user has tuned, and adding to them would
  // change a split they chose rather than offering them something new.
  const TOPPED_UP = {
    countries: DEFAULT_COUNTRIES,
    profiles: DEFAULT_PROFILES,
    printers: DEFAULT_PRINTERS,
    materials: DEFAULT_MATERIALS,
    shipping: DEFAULT_SHIPPING,
    packaging: DEFAULT_PACKAGING,
    hardware: DEFAULT_HARDWARE,
  };
  if (!merged.removed || typeof merged.removed !== 'object') merged.removed = {};
  for (const [key, shipped] of Object.entries(TOPPED_UP)) {
    const byId = new Map(shipped.map((entry) => [entry.id, entry]));
    // A shipped default the user has deleted for good must not be re-added here.
    const gone = new Set(Array.isArray(merged.removed[key]) ? merged.removed[key] : []);

    // Fields, as well as entries. A shipped entry the user already has may have
    // grown a key since they first saw it - a printer's filament capability,
    // say - and their stored copy simply does not have it. Their values win;
    // the shipped ones only fill gaps. Without this a new field can never reach
    // a workshop that already exists, and it fails in the most confusing way
    // possible: the feature works for a new user and not for anybody else.
    merged[key] = merged[key].map((stored) => {
      const from = byId.get(stored.id);
      return from ? { ...clone(from), ...stored } : stored;
    });

    const have = new Set(merged[key].map((entry) => entry.id));
    for (const entry of shipped) if (!have.has(entry.id) && !gone.has(entry.id)) merged[key].push(clone(entry));
  }

  // The labour list is topped up the same way, and for the same reason: a new
  // shipped operation - the plate changeover, say - would otherwise never reach
  // a workshop that already exists. It is not in the loop above because it is
  // nested under `labour`, and forgetting it is exactly how this went wrong the
  // first two times.
  {
    const shippedOps = new Map(DEFAULT_LABOUR_OPS.map((op) => [op.id, op]));
    const ops = merged.labour.ops.map((stored) => {
      const from = shippedOps.get(stored.id);
      return from ? { ...clone(from), ...stored } : stored;
    });
    const have = new Set(ops.map((op) => op.id));
    // A shipped operation the user deleted for good is tombstoned, so it is not
    // topped back up here (the same rule the catalogues follow).
    const goneOps = new Set(Array.isArray(merged.removed.labourOps) ? merged.removed.labourOps : []);
    for (const op of DEFAULT_LABOUR_OPS) if (!have.has(op.id) && !goneOps.has(op.id)) ops.push(clone(op));
    // Deburring used to be automatic (per part); it is now a post-processing
    // choice. A workshop that stored the old shape keeps its own minutes but has
    // the scope moved, so a plain part is no longer charged for cleanup it did
    // not get.
    for (const op of ops) if (op.id === 'cleaning' && op.per === 'unit') op.per = 'deburrUnit';
    merged.labour = { ...merged.labour, ops };
  }

  // A deleted block would reach the engine as `settings.thirds.commercialShare`
  // on undefined. Objects are restored the same way the catalogues are.
  for (const key of ['thirds', 'ctc', 'scrap', 'demand', 'freeShipping', 'handling',
    'storage', 'tax', 'estimate', 'factorModel', 'capacity', 'numbering', 'company',
    'customerPortal', 'ui']) {
    if (!merged[key] || typeof merged[key] !== 'object') merged[key] = clone(defaults[key]);
  }

  // The growth split is newer than the thirds block, so a settings blob from
  // before it exists needs the default filled in rather than left undefined.
  if (merged.thirds.growthClientShare == null) {
    merged.thirds.growthClientShare = DEFAULT_THIRDS.growthClientShare;
  }
  // Likewise the customer-facing quote buffer.
  if (merged.customerPortal.quoteBuffer == null) {
    merged.customerPortal.quoteBuffer = defaults.customerPortal.quoteBuffer;
  }
  // The scheduler block is newer than most stored settings.
  if (!merged.scheduler || typeof merged.scheduler !== 'object') {
    merged.scheduler = clone(defaults.scheduler);
  }
  // Post-processing is newer still. Fill the block and its two halves so a
  // stored workshop can reach the resin and NFC settings.
  if (!merged.postProcessing || typeof merged.postProcessing !== 'object') {
    merged.postProcessing = clone(defaults.postProcessing);
  }
  if (!merged.postProcessing.resin || typeof merged.postProcessing.resin !== 'object') {
    merged.postProcessing.resin = clone(defaults.postProcessing.resin);
  }
  if (!merged.postProcessing.nfc || typeof merged.postProcessing.nfc !== 'object') {
    merged.postProcessing.nfc = clone(defaults.postProcessing.nfc);
  }
  if (!merged.colour || typeof merged.colour !== 'object') merged.colour = clone(defaults.colour);
  // Branding fields are newer than the company block.
  if (merged.company.accentColour == null) merged.company.accentColour = defaults.company.accentColour;
  if (!('logo' in merged.company)) merged.company.logo = defaults.company.logo;

  return merged;
}

/**
 * Apply a pricing preset.
 *
 * Returns new settings rather than mutating: a preset that quietly rewrote the
 * live object would make "what did this quote actually use" unanswerable.
 */
export function applyPreset(settings, presetId) {
  const preset = settings.presets.find((p) => p.id === presetId);
  if (!preset) return settings;
  const next = clone(settings);
  next.presetId = preset.id;
  next.thirds = { ...next.thirds, ...preset.thirds };
  if (preset.demandOverride != null) {
    next.demand = { ...next.demand, mode: 'manual', manualMultiplier: preset.demandOverride };
  }
  next.discount = preset.discount ? { ...preset.discount } : { kind: 'none' };
  return next;
}

/** When the country changes, the things that follow from it follow. */
export function applyCountry(settings, countryId) {
  const country = findCountry(settings.countries, countryId);
  const next = clone(settings);
  next.countryId = country.id;
  next.currencyCode = country.currency;
  next.electricityAlternativeId = null;
  next.tax = {
    ...next.tax,
    rate: country.vatRate,
    name: country.vatName,
    inclusive: country.pricesIncludeVat,
  };
  const local = next.shipping.find((s) => s.country === country.id && s.basePrice > 0);
  if (local) next.defaultShippingId = local.id;
  return next;
}

/** The next document number, and the settings that remember it was used. */
export function nextNumber(settings, kind) {
  const map = { project: 'nextProject', quote: 'nextQuote', invoice: 'nextInvoice' };
  const prefixes = { project: 'projectPrefix', quote: 'quotePrefix', invoice: 'invoicePrefix' };
  const key = map[kind];
  if (!key) throw new Error(`Unknown document kind ${kind}`);

  const n = Math.max(1, Math.round(num(settings.numbering[key], 1)));
  const pad = Math.max(1, Math.round(num(settings.numbering.pad, 4)));
  const year = new Date().getFullYear();
  const number = `${settings.numbering[prefixes[kind]]}${year}-${String(n).padStart(pad, '0')}`;
  return { number, numbering: { ...settings.numbering, [key]: n + 1 } };
}
