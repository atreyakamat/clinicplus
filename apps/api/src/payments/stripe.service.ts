import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type StripeEvent = ReturnType<Stripe['webhooks']['constructEvent']>;
export type CheckoutSession = Awaited<ReturnType<Stripe['checkout']['sessions']['create']>>;
export type StripeRefund = Awaited<ReturnType<Stripe['refunds']['create']>>;

/**
 * Thin wrapper over the Stripe SDK. Every network call goes through one of these
 * methods so tests can replace them without touching the network.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('PAYMENTS_PROVIDER') === 'stripe' && !!this.config.get<string>('STRIPE_SECRET_KEY');
  }

  /**
   * Billing currency as a lowercase ISO code. Pass the clinic's own
   * `organization.currency` for per-clinic billing; the CURRENCY env is only the
   * deployment-wide default for orgs that have none.
   */
  currency(override?: string | null): string {
    return (override || this.config.get<string>('CURRENCY') || 'INR').toLowerCase();
  }

  appBaseUrl(): string {
    return (this.config.get<string>('APP_BASE_URL') || 'http://localhost:5173').replace(/\/+$/, '');
  }

  private stripe(): Stripe {
    if (!this.isEnabled()) throw new BadRequestException('Online payments are not configured');
    if (!this.client) {
      this.client = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
        maxNetworkRetries: 2,
        timeout: 20_000,
      });
    }
    return this.client;
  }

  /** Verifies the Stripe-Signature header against the raw request body. */
  constructEvent(rawBody: Buffer | string, signature: string): StripeEvent {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    // constructEvent is pure (HMAC check) - no API key or network needed.
    const verifier = this.client ?? new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') || 'sk_unset');
    return verifier.webhooks.constructEvent(rawBody, signature, secret);
  }

  async createCheckoutSession(params: Parameters<Stripe['checkout']['sessions']['create']>[0], idempotencyKey?: string) {
    return this.stripe().checkout.sessions.create(params, idempotencyKey ? { idempotencyKey } : undefined);
  }

  async retrieveCheckoutSession(id: string) {
    return this.stripe().checkout.sessions.retrieve(id);
  }

  /** Best effort: an open session for a stale amount must not be payable any more. */
  async expireCheckoutSession(id: string): Promise<void> {
    try {
      await this.stripe().checkout.sessions.expire(id);
    } catch (err: any) {
      this.logger.warn(`Could not expire checkout session ${id}: ${err?.message ?? err}`);
    }
  }

  async createRefund(params: Parameters<Stripe['refunds']['create']>[0], idempotencyKey?: string) {
    return this.stripe().refunds.create(params, idempotencyKey ? { idempotencyKey } : undefined);
  }

  async listRefundsForCharge(chargeId: string): Promise<any[]> {
    const page = await this.stripe().refunds.list({ charge: chargeId, limit: 100 });
    return page.data;
  }
}
