/**
 * Phone helpers for outbound messaging.
 *
 * Numbers are normalised to E.164 (+<country><national>). A bare 10-digit
 * number (or one with a single trunk "0" prefix) is assumed to be in
 * DEFAULT_COUNTRY_CODE, which is India for this product.
 */
export const DEFAULT_COUNTRY_CODE = '91';

/** Returns an E.164 number or null when the input cannot be a valid phone number. */
export function normalizePhoneE164(raw: string | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/^whatsapp:/i, '');
  const hasPlus = s.startsWith('+');
  const hasIntlPrefix = s.startsWith('00');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // already international
  } else if (hasIntlPrefix) {
    digits = digits.slice(2);
  } else if (digits.length === 10) {
    digits = defaultCountryCode + digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  } else if (digits.length === 10 + defaultCountryCode.length && digits.startsWith(defaultCountryCode)) {
    // e.g. 919876543210 written without "+"
  } else {
    return null;
  }

  // E.164: max 15 digits, no leading zero in the country code.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  s = `+${digits}`;
  return s;
}

/**
 * Stored patient phones are free text. Returns the spellings a number may have
 * been saved with, so inbound messages can be matched with an indexed `IN` query.
 */
export function phoneLookupCandidates(e164: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string[] {
  const digits = e164.replace(/\D/g, '');
  const out = new Set<string>([e164, digits]);
  if (digits.startsWith(defaultCountryCode)) {
    const national = digits.slice(defaultCountryCode.length);
    out.add(national);
    out.add(`0${national}`);
    out.add(`+${defaultCountryCode} ${national}`);
    out.add(`${defaultCountryCode} ${national}`);
    out.add(`+${defaultCountryCode}-${national}`);
    if (national.length === 10) {
      out.add(`${national.slice(0, 5)} ${national.slice(5)}`);
      out.add(`+${defaultCountryCode} ${national.slice(0, 5)} ${national.slice(5)}`);
    }
  }
  return [...out];
}

/** Masks a phone number for logs: +9198******10 */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return phone.slice(0, 5) + '*'.repeat(Math.max(0, phone.length - 7)) + phone.slice(-2);
}
