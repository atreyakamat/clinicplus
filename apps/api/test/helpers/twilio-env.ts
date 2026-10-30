// Import FIRST in a suite (before ./app) so ConfigModule validates with the Twilio driver enabled.
// No network: suites must mock axios.post.
export const TWILIO_TEST_ENV = {
  MESSAGING_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'AC' + '0123456789abcdef0123456789abcdef',
  TWILIO_AUTH_TOKEN: 'test-twilio-auth-token-0123456789',
  TWILIO_SMS_FROM: '+15005550006',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
  API_PUBLIC_URL: 'https://api.clinic.test',
};

const previous: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(TWILIO_TEST_ENV)) {
  previous[k] = process.env[k];
  process.env[k] = v;
}

export function restoreTwilioEnv() {
  for (const [k, v] of Object.entries(previous)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
