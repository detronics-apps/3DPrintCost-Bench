/**
 * Money. Pure.
 *
 * One owner for two decisions that are otherwise made differently in five
 * places: how many minor units a currency has, and when rounding happens.
 *
 * The rule: arithmetic runs at full precision and rounds ONCE, at the point a
 * number becomes a line on a document. Rounding each intermediate step makes a
 * quote that does not add up, and it makes the same quote add up differently
 * depending on which screen produced it.
 */

/** Currencies the app ships with. `minor` is the number of decimal places. */
export const CURRENCIES = {
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African rand', minor: 2 },
  EUR: { code: 'EUR', symbol: '\u20ac', name: 'Euro', minor: 2 },
  CNY: { code: 'CNY', symbol: '\u00a5', name: 'Chinese yuan', minor: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US dollar', minor: 2 },
  GBP: { code: 'GBP', symbol: '\u00a3', name: 'Pound sterling', minor: 2 },
};

export const DEFAULT_CURRENCY = 'ZAR';

export function currency(code) {
  return CURRENCIES[code] || CURRENCIES[DEFAULT_CURRENCY];
}

/** A finite number or `fallback`. Share links and imported files carry junk. */
export function num(value, fallback = 0) {
  const x = typeof value === 'string' ? Number(value.replace(/[\s,]/g, '')) : Number(value);
  return Number.isFinite(x) ? x : fallback;
}

/** Round to a currency's minor unit. The only place money is ever rounded. */
export function round(value, code = DEFAULT_CURRENCY) {
  const x = num(value);
  const factor = 10 ** currency(code).minor;
  // Nudge off the binary-representation boundary: 1.005 is stored just below
  // 1.005, so a plain Math.round takes it down and a cent goes missing.
  return Math.round((x + Number.EPSILON * Math.abs(x)) * factor) / factor;
}

/** `R 1 234.56`. Grouped with a thin space so it never reads as a decimal point. */
export function fmtMoney(value, code = DEFAULT_CURRENCY, { sign = false } = {}) {
  const cur = currency(code);
  const x = round(value, code);
  if (!Number.isFinite(x)) return '\u2014';
  const negative = x < 0;
  const body = Math.abs(x)
    .toFixed(cur.minor)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  const lead = negative ? '\u2212' : (sign && x > 0 ? '+' : '');
  return `${lead}${cur.symbol}${body}`;
}

/** A rate as a percentage for display: 0.155 -> `15.5%`. */
export function fmtRate(fraction, digits = 1) {
  const x = num(fraction) * 100;
  const text = x.toFixed(digits).replace(/\.?0+$/, '');
  return `${text}%`;
}

/** A percentage typed by a person (`15`, `15%`, `0.15%`) as a fraction. */
export function parsePercent(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value / 100 : fallback;
  const text = String(value ?? '').trim().replace('%', '');
  const x = Number(text);
  return Number.isFinite(x) ? x / 100 : fallback;
}

/* ------------------------------------------------------------------ tax -- */

/**
 * Tax on an amount.
 *
 * `inclusive` says whether the price already contains the tax. Getting this
 * wrong is a 15% error that looks like a rounding problem, so both directions
 * live here rather than being re-derived at each call site.
 */
export function tax(amount, rate, { inclusive = false } = {}) {
  const base = num(amount);
  const r = num(rate);
  if (r <= 0) return { net: base, tax: 0, gross: base, rate: r, inclusive };
  if (inclusive) {
    const net = base / (1 + r);
    return { net, tax: base - net, gross: base, rate: r, inclusive };
  }
  return { net: base, tax: base * r, gross: base * (1 + r), rate: r, inclusive };
}

/** Sum that tolerates junk, so one bad field cannot NaN an entire invoice. */
export const sum = (values) => values.reduce((total, v) => total + num(v), 0);
