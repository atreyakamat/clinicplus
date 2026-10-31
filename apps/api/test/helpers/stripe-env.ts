/**
 * Import FIRST in Stripe e2e suites: sets PAYMENTS_PROVIDER=stripe with test
 * credentials before AppModule (and its env validation) is loaded.
 * No network is used: tests replace StripeService API calls with jest spies,
 * and webhook signatures are produced with stripe.webhooks.generateTestHeaderString.
 */
export const STRIPE_TEST_ENV = {
  PAYMENTS_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_e2e_not_a_real_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_e2e_test_secret',
  CURRENCY: 'INR',
  APP_BASE_URL: 'https://clinic.example.test',
} as const;

const previous: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(STRIPE_TEST_ENV)) {
  previous[k] = process.env[k];
  process.env[k] = v;
}

export function restoreStripeEnv() {
  for (const [k, v] of Object.entries(previous)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
