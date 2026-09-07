/**
 * Email and phone checking for the client form. Pure.
 *
 * The phone check is deliberately LENIENT: it accepts a number written the way
 * people actually write them — with spaces, dashes, brackets, a leading 0, a
 * leading + or a bare local number — and normalises it to +<country><digits>.
 * It rejects only what cannot be a phone number (too few or too many digits),
 * so a valid-but-unusual number is never turned away. The country supplies the
 * dialling code; the form defaults it to the company's own country.
 */

/** Dialling code, national trunk prefix, example, and the number of digits a
 *  national number has after the code (`nsn`) so a wrong length is rejected. */
const DIAL = {
  ZA: { code: '27', trunk: '0', nsn: 9, name: 'South African', example: '082 123 4567' },
  NL: { code: '31', trunk: '0', nsn: 9, name: 'Dutch', example: '06 12345678' },
  CN: { code: '86', trunk: '0', nsn: 11, name: 'Chinese', example: '131 2345 6789' },
  US: { code: '1', trunk: '1', nsn: 10, name: 'US', example: '(555) 123-4567' },
};

const FALLBACK = { code: '', trunk: '0', example: '' };

/** The dialling info for a country, or a safe blank when it is unknown. */
export function dialInfoFor(countryId) {
  return DIAL[countryId] || FALLBACK;
}

/** Just the dialling code digits for a country, e.g. '27'. */
export function dialCodeFor(countryId) {
  return dialInfoFor(countryId).code;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an email address. Returns { ok, value (trimmed), message }. */
export function validateEmail(value) {
  const v = String(value ?? '').trim();
  if (!v) return { ok: false, value: '', message: 'Enter an email address.' };
  if (!EMAIL_RE.test(v)) {
    return { ok: false, value: v, message: 'That does not look like an email address.' };
  }
  return { ok: true, value: v, message: '' };
}

/**
 * Validate and normalise a phone number for a country.
 *
 * Returns { ok, value (normalised to +<code><digits> when ok, else the raw
 * input), message }.
 */
export function validatePhone(value, countryId) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, value: '', message: 'Enter a phone number.' };

  const info = dialInfoFor(countryId);
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return { ok: false, value: raw, message: 'That does not look like a phone number.' };

  if (hasPlus) {
    // Already international — keep the digits as given.
  } else if (digits.startsWith('00')) {
    // 00 is the other way of writing a leading +.
    digits = digits.slice(2);
  } else if (info.code && info.trunk && info.trunk !== info.code && digits.startsWith(info.trunk)) {
    // Local trunk form: 082… → 27 82…
    digits = info.code + digits.slice(info.trunk.length);
  } else if (info.code && !digits.startsWith(info.code)) {
    // A bare local number — prefix the country's code.
    digits = info.code + digits;
  }

  // Check the length. For a known country the national part (after the dialling
  // code) must have exactly the right number of digits, so 3 digits or 30 digits
  // are both rejected clearly; for an unknown country, fall back to a plausible
  // total range.
  if (info.nsn) {
    const national = digits.startsWith(info.code) ? digits.slice(info.code.length) : digits;
    if (national.length !== info.nsn) {
      const label = info.name ? `A ${info.name} number` : 'This number';
      return {
        ok: false,
        value: raw,
        message: `${label} should have ${info.nsn} digits after +${info.code} `
          + `(you have ${national.length}). For example ${info.example}.`,
      };
    }
  } else if (digits.length < 8 || digits.length > 15) {
    return { ok: false, value: raw, message: 'That does not look like a valid phone number.' };
  }
  return { ok: true, value: `+${digits}`, message: '' };
}
