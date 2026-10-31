import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Twilio request signature (X-Twilio-Signature):
 * base64(HMAC-SHA1(authToken, fullUrl + concat(sorted POST param name + value))).
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, unknown>): string {
  const data = Object.keys(params ?? {})
    .sort()
    .reduce((acc, key) => {
      const v = params[key];
      if (Array.isArray(v)) return acc + v.map((x) => key + String(x)).join('');
      return acc + key + (v === undefined || v === null ? '' : String(v));
    }, url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, unknown>,
  signature: string | undefined | null,
): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
