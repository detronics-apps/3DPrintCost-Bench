/**
 * Country defaults. Pure.
 *
 * Everything here is a *starting value*, not a fact about the world. Tariffs,
 * VAT rates and labour rates move, and they differ between suppliers inside one
 * country. The app's job is to make them easy to correct, and to never quietly
 * apply a South African number to a Dutch quote.
 *
 * `asOf` is on every entry so the reader can see how stale a default is.
 */

import { num } from './money.js';

export const AS_OF = '2026-01';

/**
 * Electricity: `tariff` is the marginal cost of a kWh including everything that
 * scales with consumption. South Africa gets a prepaid entry as well, because a
 * prepaid block tariff is what most small workshops there actually pay.
 */
export const DEFAULT_COUNTRIES = [
  {
    id: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    vatRate: 0.15,
    vatName: 'VAT',
    pricesIncludeVat: false,
    electricity: {
      tariff: 3.1,
      unit: 'kWh',
      label: 'Municipal domestic, block 2',
      alternatives: [
        { id: 'prepaid-b1', label: 'Prepaid block 1 (0-600 kWh)', tariff: 2.65 },
        { id: 'prepaid-b2', label: 'Prepaid block 2 (over 600 kWh)', tariff: 3.35 },
        { id: 'business', label: 'Small business, single phase', tariff: 3.45 },
      ],
    },
    labourRate: 120,
    labourRateNote: 'Skilled workshop operator, cost to company per hour.',
    asOf: AS_OF,
  },
  {
    id: 'NL',
    name: 'Netherlands',
    currency: 'EUR',
    vatRate: 0.21,
    vatName: 'BTW',
    pricesIncludeVat: true,
    electricity: {
      tariff: 0.32,
      unit: 'kWh',
      label: 'Household variable, all-in',
      alternatives: [
        { id: 'fixed', label: 'Fixed contract', tariff: 0.28 },
        { id: 'business', label: 'Small business (excl. BTW)', tariff: 0.24 },
      ],
    },
    labourRate: 38,
    labourRateNote: 'Employer cost per hour for a technical operator.',
    asOf: AS_OF,
  },
  {
    id: 'CN',
    name: 'China',
    currency: 'CNY',
    vatRate: 0.13,
    vatName: 'VAT',
    pricesIncludeVat: false,
    electricity: {
      tariff: 0.62,
      unit: 'kWh',
      label: 'Commercial, tier 1',
      alternatives: [
        { id: 'residential', label: 'Residential tier 1', tariff: 0.55 },
        { id: 'industrial', label: 'Industrial', tariff: 0.72 },
      ],
    },
    labourRate: 45,
    labourRateNote: 'Workshop operator, employer cost per hour.',
    asOf: AS_OF,
  },
  {
    id: 'US',
    name: 'United States',
    currency: 'USD',
    vatRate: 0,
    vatName: 'Sales tax',
    pricesIncludeVat: false,
    electricity: {
      tariff: 0.17,
      unit: 'kWh',
      label: 'National average, residential',
      alternatives: [
        { id: 'commercial', label: 'National average, commercial', tariff: 0.13 },
        { id: 'ca', label: 'California residential', tariff: 0.31 },
      ],
    },
    labourRate: 32,
    labourRateNote: 'Shop rate per hour, fully loaded.',
    asOf: AS_OF,
  },
];

export const DEFAULT_COUNTRY_ID = 'ZA';

/** Named fallback, never positional. */
export function findCountry(countries, id) {
  return countries.find((c) => c.id === id)
    || countries.find((c) => c.id === DEFAULT_COUNTRY_ID)
    || countries[0];
}

/**
 * Sales tax in the United States is charged by state and city, not federally,
 * so the shipped rate is zero and the app says why rather than inventing one.
 */
export const TAX_NOTES = {
  US: 'Sales tax in the United States is set by state and city. The default is '
    + 'zero; enter the rate that applies where you invoice from.',
  ZA: 'VAT is only charged once the business is registered for it. Turn the rate '
    + 'to zero until you are.',
  NL: 'The Dutch default assumes displayed prices include BTW, which is what '
    + 'consumer pricing there requires.',
  CN: 'The small-scale taxpayer rate differs from the general 13%. Check which '
    + 'applies to you.',
};

/** The marginal cost of a kWh for a country and a chosen tariff option. */
export function electricityTariff(country, alternativeId = null) {
  if (!country) return 0;
  if (!alternativeId) return num(country.electricity.tariff);
  const alt = (country.electricity.alternatives || []).find((a) => a.id === alternativeId);
  return alt ? num(alt.tariff) : num(country.electricity.tariff);
}
