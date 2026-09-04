/**
 * Display formatting. Pure.
 *
 * Internal values are kept at full precision so repeated arithmetic does not
 * drift. Nothing here is allowed to leak that precision into prose: every
 * number a person reads goes through one of these with an explicit
 * significant-figure count. See references/pitfalls.md #9 — the symptom is a
 * warning that reads `draws 19.6078431373 mA`.
 *
 * Copy this file into a new app unchanged and add the unit helpers it needs at
 * the bottom, the way `unit()` shows.
 */

/** Round to `digits` significant figures. Returns a number, not a string. */
export function sig(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return 0;
  const d = Math.max(1, Math.min(15, Math.trunc(digits)));
  const mag = Math.ceil(Math.log10(Math.abs(x)));
  const factor = 10 ** (d - mag);
  return Math.round(x * factor) / factor;
}

/**
 * A number as a person would write it: significant figures, no exponent for
 * anything of a size that turns up on a workbench, trailing zeros trimmed.
 */
export function fmtNum(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';

  const abs = Math.abs(x);
  if (abs >= 1e7 || abs < 1e-4) return sig(x, digits).toExponential(Math.max(0, digits - 1));

  const rounded = sig(x, digits);
  const decimals = Math.max(0, Math.min(6, digits - Math.ceil(Math.log10(Math.abs(rounded)))));
  return trimZeros(rounded.toFixed(decimals));
}

const trimZeros = (text) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);

/** Signed value with an explicit `+`, for anything where direction matters. */
export function fmtSigned(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 10 ** -12) return '0';
  return (x > 0 ? '+' : '−') + fmtNum(Math.abs(x), digits);
}

/** `+2.13%`, for how far a real value lands from a target. */
export function fmtPct(value, digits = 3) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 5e-4) return '0%';
  return `${fmtSigned(x, digits)}%`;
}

/**
 * A unit helper, so each app declares its own rather than reimplementing the
 * rounding. `const fmtVolts = unit('V');` then `fmtVolts(3.30001)` → `3.3 V`.
 */
export const unit = (suffix, defaultDigits = 4) =>
  (value, digits = defaultDigits) => `${fmtNum(value, digits)} ${suffix}`;

/* ---------------------------------------------------------------- ratios -- */

/** Greatest common divisor of two non-negative integers. */
export function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) { [x, y] = [y, x % y]; }
  return x;
}

/**
 * A whole-number ratio in lowest terms. Worth showing wherever the reduced pair
 * means something the raw pair does not — 40:16 is 5:2, and that is what says
 * the same teeth meet every fifth turn.
 */
export function reduceRatio(a, b) {
  const g = gcd(a, b) || 1;
  return { a: Math.round(a) / g, b: Math.round(b) / g, divisor: g };
}

/** `3.75 : 1`, flipping so the larger side is always the one written out. */
export function fmtRatio(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return '—';
  const abs = Math.abs(x);
  return abs >= 1 ? `${fmtNum(abs, digits)} : 1` : `1 : ${fmtNum(1 / abs, digits)}`;
}
