/**
 * What the customer-facing form is allowed to know. Pure.
 *
 * The form has to price, and pricing needs the cost model - there is no server
 * to do it on. So the configuration necessarily carries the pricing settings,
 * and the company is told that plainly rather than being left to assume the
 * link is safe to publish.
 *
 * What it does NOT carry is everything pricing does not need: the customer
 * list, the projects, the document numbering, the terms, the UI state. Those
 * are somebody else's business and there is no reason for them to travel.
 */

import { methodsForCountry } from './shipping.js';
import { migrateSettings } from './settings.js';
import { num } from './money.js';

/** Only the slices the engine reads. Everything else is left behind. */
const PRICING_KEYS = [
  'version', 'countryId', 'currencyCode', 'electricityAlternativeId', 'countries',
  'tax', 'printers', 'materials', 'profiles', 'shipping', 'packaging', 'hardware',
  'labour', 'factorModel', 'estimate', 'ctc', 'scrap', 'thirds', 'allocations',
  'demand', 'volumeTiers', 'freeShipping', 'defaultShippingId', 'handling',
  'storage', 'capacity',
];

/** Slices that must never travel in a link handed to a customer. */
export const WITHHELD_KEYS = ['presets', 'presetId', 'numbering', 'ui', 'discount'];

export function pricingSettings(settings) {
  const out = {};
  for (const key of PRICING_KEYS) if (settings[key] !== undefined) out[key] = settings[key];
  // The company block travels as a name and a contact only: the customer needs
  // somewhere to send the request, not the registration and VAT numbers.
  out.company = {
    name: settings.company.name,
    email: settings.company.email,
    phone: settings.company.phone,
    handlingDays: settings.company.handlingDays,
    quoteValidityDays: settings.company.quoteValidityDays,
  };
  return out;
}

/** What the company hands out: the options, plus what is needed to price them. */
export function portalConfig(settings) {
  const portal = settings.customerPortal;
  const allowed = (list, ids) => list.filter((x) => !x.archived && (!ids.length || ids.includes(x.id)));

  return {
    v: 1,
    company: {
      name: settings.company.name,
      email: settings.company.email,
      phone: settings.company.phone,
    },
    countryId: settings.countryId,
    currencyCode: settings.currencyCode,
    showBreakdown: portal.showBreakdown,
    minimumOrder: portal.minimumOrder,
    allowExpress: portal.allowExpress,
    expediteMode: ['off', 'optional', 'only'].includes(portal.expediteMode) ? portal.expediteMode : 'off',
    leadTimeNote: portal.leadTimeNote,
    quoteBuffer: Math.max(0, num(portal.quoteBuffer, 0)),
    quoteValidityDays: Math.max(1, Math.round(num(settings.company.quoteValidityDays, 30))),
    profiles: settings.profiles
      .filter((p) => portal.allowedProfiles.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name, blurb: p.blurb })),
    printers: allowed(settings.printers, portal.allowedPrinters)
      .map((p) => ({ id: p.id, name: p.name })),
    materials: allowed(settings.materials, portal.allowedMaterials)
      .map((m) => ({ id: m.id, name: m.name, colour: m.colour, type: m.type })),
    // The embedded hardware a customer may ask for - magnets, inserts, an NFC
    // tag. The price model behind it already travels in `pricing.hardware`; this
    // is just the pick-list, without the internal part number.
    hardware: settings.hardware
      .filter((h) => !h.archived)
      .map((h) => ({ id: h.id, name: h.name, category: h.category })),
    shipping: methodsForCountry(settings.shipping, settings.countryId)
      .filter((m) => portal.allowExpress || !/express/i.test(m.id))
      .map((m) => ({ id: m.id, name: m.name, days: m.days })),
    pricing: pricingSettings(settings),
  };
}

/** Rebuild a settings object the engine can price with. */
export function settingsFromConfig(config) {
  return migrateSettings(config?.pricing || null);
}

/** The fragment a link carries. Fragments are never sent to a server. */
export function portalFragment(settings) {
  return encodeURIComponent(JSON.stringify(portalConfig(settings)));
}
