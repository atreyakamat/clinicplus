import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Invoice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { pageArgs, paginated } from '../common/pagination';
import { assertUuid } from '../common/validation/uuid';
import { SmsService } from '../messages/sms.service';
import { COLLECTED_STATUSES, D, fromMinorUnits, moneyInput, toMinorUnits } from '../invoices/billing.utils';
import { LedgerService } from './ledger.service';
import { CheckoutSession, StripeEvent, StripeRefund, StripeService } from './stripe.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.dto';
import { resolveTimezone, zonedDayStart, addDaysYmd } from '../analytics/date-range.util';

export interface Actor {
  id: string;
  organizationId: string;
  branchId: string;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const STRIPE_REFUND_STATUS: Record<string, string> = {
  succeeded: 'COMPLETED',
  pending: 'PENDING',
  requires_action: 'PENDING',
  failed: 'FAILED',
  canceled: 'FAILED',
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly stripe: StripeService,
    private readonly audit: AuditService,
    private readonly timeline: TimelineService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ---------------------------------------------------------------- manual payments

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: Actor) {
    assertUuid(invoiceId, 'invoiceId');
    const amount = moneyInput(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('amount must be greater than zero');

    if (dto.idempotencyKey) {
      const replay = await this.findIdempotent(dto.idempotencyKey, invoiceId, actor);
      if (replay) return replay;
    }

    let staleSession: string | null = null;
    let payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const invoice = await this.ledger.lockInvoice(tx, invoiceId, actor.organizationId, actor.branchId);
        if (invoice.status === 'VOID') throw new BadRequestException('Cannot record a payment on a void invoice');
        const { net } = await this.ledger.balance(invoice.id, tx);
        const outstanding = invoice.total.minus(net);
        if (outstanding.lte(0)) throw new BadRequestException('Invoice is already fully paid');
        if (amount.gt(outstanding)) {
          throw new BadRequestException(
            `Payment amount exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
          );
        }
        const created = await tx.payment.create({
          data: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            invoiceId: invoice.id,
            amount,
            paymentMethod: dto.paymentMethod,
            transactionReference: dto.transactionReference?.trim() || null,
            idempotencyKey: dto.idempotencyKey ?? null,
            paymentStatus: 'PAID',
            paidAt: new Date(),
            createdById: actor.id,
          },
        });
        // Any open Stripe session was priced for the old balance: retire it.
        if (invoice.stripeCheckoutSessionId && invoice.paymentLinkUrl) {
          staleSession = invoice.stripeCheckoutSessionId;
          await tx.invoice.update({ where: { id: invoice.id }, data: { paymentLinkUrl: null } });
          invoice.paymentLinkUrl = null;
        }
        await this.ledger.syncStatus(invoice, tx);
        return { payment: created, patientId: invoice.patientId, invoiceNumber: invoice.invoiceNumber };
      });
    } catch (err) {
      if (dto.idempotencyKey && isUniqueViolation(err)) {
        const replay = await this.findIdempotent(dto.idempotencyKey, invoiceId, actor);
        if (replay) return replay;
      }
      throw err;
    }

    if (staleSession && this.stripe.isEnabled()) await this.stripe.expireCheckoutSession(staleSession);

    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: payment.patientId,
      eventType: 'PAYMENT_COLLECTED',
      eventCategory: 'BILLING',
      title: 'Payment received',
      description: `${amount.toFixed(2)} by ${dto.paymentMethod} against ${payment.invoiceNumber}`,
      createdBy: actor.id,
      metadata: { invoiceId, paymentId: payment.payment.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'PAYMENT_RECORDED',
      resource: 'payment',
      resourceId: payment.payment.id,
      afterData: { invoiceId, amount: amount.toFixed(2), method: dto.paymentMethod },
    });
    return payment.payment;
  }

  private async findIdempotent(key: string, invoiceId: string, actor: Actor) {
    const existing = await this.prisma.payment.findFirst({
      where: { organizationId: actor.organizationId, idempotencyKey: key },
    });
    if (!existing) return null;
    if (existing.invoiceId !== invoiceId || existing.branchId !== actor.branchId) {
      throw new ConflictException('idempotencyKey was already used for a different payment');
    }
    return existing;
  }

  // ---------------------------------------------------------------- reads

  async findPaymentById(id: string, organizationId: string, branchId: string) {
    assertUuid(id, 'paymentId');
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId, branchId },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true, patientId: true } },
        refunds: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async getPaymentsByInvoice(invoiceId: string, organizationId: string, branchId: string) {
    assertUuid(invoiceId, 'invoiceId');
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId, branchId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.payment.findMany({
      where: { invoiceId, organizationId, branchId },
      include: {
        refunds: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPayments(q: ListPaymentsQueryDto, organizationId: string, branchId: string) {
    const { page, limit, skip, take } = pageArgs(q);
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId }, select: { timezone: true } });
    const tz = resolveTimezone(branch?.timezone, process.env.DEFAULT_TIMEZONE);
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = zonedDayStart(q.from, tz);
    if (q.to) createdAt.lt = zonedDayStart(addDaysYmd(q.to, 1), tz);
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      branchId,
      ...(q.includeRefunds ? {} : { isRefund: false }),
      ...(q.invoiceId ? { invoiceId: q.invoiceId } : {}),
      ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
      ...(q.from || q.to ? { createdAt } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              patient: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          refunds: { select: { id: true, amount: true, status: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(items, total, page, limit);
  }

  // ---------------------------------------------------------------- refunds

  async refundPayment(paymentId: string, dto: RefundPaymentDto, actor: Actor) {
    assertUuid(paymentId, 'paymentId');
    const amount = moneyInput(dto.amount);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId: actor.organizationId, branchId: actor.branchId, isRefund: false },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!COLLECTED_STATUSES.includes(payment.paymentStatus as any)) {
      throw new BadRequestException('Only collected payments can be refunded');
    }
    const viaStripe = payment.paymentMethod === 'STRIPE';
    if (viaStripe) {
      if (!this.stripe.isEnabled()) {
        throw new BadRequestException('Online payments are not configured; this card payment must be refunded in Stripe');
      }
      if (!payment.transactionReference) throw new BadRequestException('Stripe payment has no payment intent reference');
    }

    const { refund, invoice } = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.ledger.lockInvoice(tx, payment.invoiceId, actor.organizationId, actor.branchId);
      const already = await this.ledger.refundedForPayment(payment.id, tx);
      const refundable = payment.amount.minus(already);
      if (amount.gt(refundable)) {
        throw new BadRequestException(`Refund exceeds the refundable amount of ${refundable.toFixed(2)}`);
      }
      const refund = await tx.refund.create({
        data: {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount,
          reason: dto.reason.trim(),
          // Cash/card/UPI refunds are handed back at the desk: recorded as done.
          status: viaStripe ? 'PENDING' : 'COMPLETED',
          processedAt: viaStripe ? null : new Date(),
        },
      });
      if (!viaStripe) {
        await this.ledger.syncPaymentRefundStatus(payment.id, tx);
        await this.ledger.syncStatus(invoice, tx);
      }
      return { refund, invoice };
    });

    let result = refund;
    if (viaStripe) {
      // Refund in the clinic's own currency (matches the original charge).
      const org = await this.prisma.organization.findUnique({
        where: { id: actor.organizationId },
        select: { currency: true },
      });
      const refundCurrency = this.stripe.currency(org?.currency);
      let stripeRefund: StripeRefund;
      try {
        stripeRefund = await this.stripe.createRefund(
          {
            payment_intent: payment.transactionReference!,
            amount: toMinorUnits(amount, refundCurrency),
            reason: 'requested_by_customer',
            metadata: { refundId: refund.id, invoiceId: payment.invoiceId, organizationId: actor.organizationId },
          },
          `refund-${refund.id}`,
        );
      } catch (err: any) {
        await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
        throw new BadRequestException(`Stripe refused the refund: ${err?.message ?? 'unknown error'}`);
      }
      result = await this.applyStripeRefundStatus(refund.id, stripeRefund.status ?? 'pending');
    }

    await this.timeline.record({
      organizationId: actor.organizationId,
      patientId: invoice.patientId,
      eventType: 'PAYMENT_REFUNDED',
      eventCategory: 'BILLING',
      title: 'Payment refunded',
      description: `${amount.toFixed(2)} refunded on ${invoice.invoiceNumber}: ${dto.reason}`,
      createdBy: actor.id,
      metadata: { invoiceId: invoice.id, paymentId: payment.id, refundId: refund.id },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      userId: actor.id,
      action: 'PAYMENT_REFUNDED',
      resource: 'payment',
      resourceId: payment.id,
      afterData: { refundId: refund.id, amount: amount.toFixed(2), reason: dto.reason, method: payment.paymentMethod },
    });
    return result;
  }

  private async applyStripeRefundStatus(refundId: string, stripeStatus: string) {
    const status = STRIPE_REFUND_STATUS[stripeStatus] ?? 'PENDING';
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      const invoice = await this.ledger.lockInvoice(tx, refund.invoiceId!, refund.organizationId);
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: { status, processedAt: status === 'COMPLETED' ? (refund.processedAt ?? new Date()) : refund.processedAt },
      });
      await this.ledger.syncPaymentRefundStatus(refund.paymentId, tx);
      await this.ledger.syncStatus(invoice, tx);
      return updated;
    });
  }

  // ---------------------------------------------------------------- Stripe checkout links

  async createPaymentLink(invoiceId: string, actor: Actor, opts: { send?: boolean } = {}) {
    assertUuid(invoiceId, 'invoiceId');
    if (!this.stripe.isEnabled()) throw new BadRequestException('Online payments are not configured');

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: actor.organizationId, branchId: actor.branchId, deletedAt: null },
      include: {
        organization: { select: { name: true, currency: true } },
        patient: { select: { id: true, firstName: true, phone: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') throw new BadRequestException('Cannot create a payment link for a void invoice');
    const { net } = await this.ledger.balance(invoice.id);
    const outstanding = invoice.total.minus(net);
    if (outstanding.lte(0)) throw new BadRequestException('Invoice has no outstanding balance');

    const currency = this.stripe.currency(invoice.organization.currency);
    const minor = toMinorUnits(outstanding, currency);
    let session: CheckoutSession | null = null;
    let reused = false;

    if (invoice.stripeCheckoutSessionId) {
      try {
        const existing = await this.stripe.retrieveCheckoutSession(invoice.stripeCheckoutSessionId);
        const fresh = (existing.expires_at ?? 0) * 1000 > Date.now() + 5 * 60_000;
        if (existing.status === 'open' && fresh && existing.amount_total === minor && existing.url) {
          session = existing;
          reused = true;
        } else if (existing.status === 'open') {
          await this.stripe.expireCheckoutSession(existing.id);
        }
      } catch (err: any) {
        this.logger.warn(`Could not load checkout session ${invoice.stripeCheckoutSessionId}: ${err?.message ?? err}`);
      }
    }

    if (!session) {
      const base = this.stripe.appBaseUrl();
      const metadata = {
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
      };
      try {
        session = await this.stripe.createCheckoutSession({
          mode: 'payment',
          client_reference_id: invoice.id,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: minor,
                product_data: {
                  name: `Invoice ${invoice.invoiceNumber}`,
                  description: invoice.organization.name,
                },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${base}/pay/result?status=success&invoice=${invoice.id}`,
          cancel_url: `${base}/pay/result?status=cancelled&invoice=${invoice.id}`,
        });
      } catch (err: any) {
        this.logger.error(`Stripe checkout session creation failed: ${err?.message ?? err}`);
        throw new ServiceUnavailableException(`Could not create the payment link: ${err?.message ?? 'Stripe error'}`);
      }
      if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL');
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          stripeCheckoutSessionId: session.id,
          paymentLinkUrl: session.url,
          ...(invoice.status === 'DRAFT' ? { status: 'SENT' } : {}),
          updatedBy: actor.id,
        },
      });
      await this.audit.log({
        organizationId: actor.organizationId,
        userId: actor.id,
        action: 'PAYMENT_LINK_CREATED',
        resource: 'invoice',
        resourceId: invoice.id,
        afterData: { sessionId: session.id, amount: outstanding.toFixed(2), currency },
      });
    }

    let sent = false;
    let sendError: string | undefined;
    let deliveryStatus: string | undefined;
    if (opts.send) {
      const sms = this.resolveSms();
      if (!sms) {
        sendError = 'Messaging is not available';
      } else if (!invoice.patient.phone) {
        sendError = 'Patient has no phone number';
      } else {
        const text =
          `Hi ${invoice.patient.firstName}, ${invoice.organization.name} invoice ${invoice.invoiceNumber} ` +
          `has ${currency.toUpperCase()} ${outstanding.toFixed(2)} due. Pay securely: ${session.url}`;
        try {
          const res: any = await sms.sendAndRecord(invoice.patientId, text, actor.organizationId, actor.branchId);
          deliveryStatus = String(res?.deliveryStatus ?? '');
          sent = !res?.gatewayError && !/FAIL|NOT_SENT|REJECT/i.test(deliveryStatus);
          if (!sent) {
            sendError = res?.gatewayError ??
              (/CONSOLE/i.test(deliveryStatus)
                ? 'Messaging provider is not configured (console driver); copy the link instead'
                : 'Message could not be delivered');
          }
        } catch (err: any) {
          sendError = err?.message ?? 'Message could not be sent';
        }
      }
    }

    return {
      url: session.url,
      sessionId: session.id,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      amount: outstanding.toFixed(2),
      currency: currency.toUpperCase(),
      reused,
      sent,
      ...(deliveryStatus ? { deliveryStatus } : {}),
      ...(sendError ? { sendError } : {}),
    };
  }

  private resolveSms(): SmsService | null {
    try {
      return this.moduleRef.get(SmsService, { strict: false });
    } catch {
      return null;
    }
  }

  /** Retires an open checkout session (invoice amount changed or invoice voided). */
  async retireCheckoutSession(invoice: Pick<Invoice, 'id' | 'stripeCheckoutSessionId'>) {
    if (!invoice.stripeCheckoutSessionId) return;
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { paymentLinkUrl: null } });
    if (this.stripe.isEnabled()) await this.stripe.expireCheckoutSession(invoice.stripeCheckoutSessionId);
  }

  // ---------------------------------------------------------------- Stripe webhook

  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature');
    let event: StripeEvent;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new BadRequestException('Invalid Stripe signature');
    }

    const obj: any = (event.data as any)?.object ?? {};
    let row;
    try {
      row = await this.prisma.webhookEvent.create({
        data: {
          provider: 'stripe',
          eventId: event.id,
          eventType: event.type,
          // Only identifiers: the full event carries customer PII.
          payload: { id: event.id, type: event.type, objectId: obj.id ?? null, livemode: !!event.livemode },
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      row = await this.prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
      });
      if (row?.processedAt) return { received: true, duplicate: true };
    }

    try {
      const organizationId = await this.processStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { id: row!.id },
        data: { processedAt: new Date(), error: null, ...(organizationId ? { organizationId } : {}) },
      });
    } catch (err: any) {
      await this.prisma.webhookEvent
        .update({ where: { id: row!.id }, data: { error: String(err?.message ?? err).slice(0, 1000) } })
        .catch(() => undefined);
      this.logger.error(`Stripe webhook ${event.id} (${event.type}) failed: ${err?.message ?? err}`);
      throw err; // non-2xx -> Stripe retries
    }
    return { received: true };
  }

  private async processStripeEvent(event: StripeEvent): Promise<string | null> {
    const obj: any = (event.data as any).object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return this.applyCheckoutSession(obj);
      case 'charge.refunded': {
        const refunds = await this.stripe.listRefundsForCharge(obj.id);
        let org: string | null = null;
        for (const r of refunds) org = (await this.syncStripeRefund(r)) ?? org;
        return org;
      }
      case 'refund.created':
      case 'refund.updated':
      case 'charge.refund.updated':
        return this.syncStripeRefund(obj);
      default:
        return null; // acknowledged, nothing to do
    }
  }

  private async applyCheckoutSession(session: any): Promise<string | null> {
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return null;
    const meta = session.metadata ?? {};
    if (!meta.invoiceId || !meta.organizationId || !meta.branchId) return null;
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: meta.invoiceId, organizationId: meta.organizationId, branchId: meta.branchId },
    });
    if (!invoice) {
      this.logger.warn(`Checkout session ${session.id} references unknown invoice ${meta.invoiceId}`);
      return null;
    }
    const amount = fromMinorUnits(Number(session.amount_total ?? 0), session.currency ?? this.stripe.currency());
    const paymentIntent =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;

    let created: { id: string } | null = null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const locked = await this.ledger.lockInvoice(tx, invoice.id, invoice.organizationId, invoice.branchId);
        const existing = await tx.payment.findFirst({
          where: { organizationId: invoice.organizationId, idempotencyKey: session.id },
        });
        if (existing) return null;
        const { net } = await this.ledger.balance(locked.id, tx);
        if (amount.gt(locked.total.minus(net))) {
          // The money is already captured; record it and leave the overpayment visible.
          this.logger.warn(`Stripe payment ${paymentIntent} exceeds the balance of ${locked.invoiceNumber}`);
        }
        const payment = await tx.payment.create({
          data: {
            organizationId: locked.organizationId,
            branchId: locked.branchId,
            invoiceId: locked.id,
            amount,
            paymentMethod: 'STRIPE',
            transactionReference: paymentIntent,
            idempotencyKey: session.id,
            paymentStatus: 'PAID',
            paidAt: new Date(),
          },
        });
        if (locked.stripeCheckoutSessionId === session.id) {
          await tx.invoice.update({ where: { id: locked.id }, data: { paymentLinkUrl: null } });
        }
        await this.ledger.syncStatus(locked, tx);
        return payment;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // concurrent duplicate delivery
    }

    if (created) {
      await this.timeline.record({
        organizationId: invoice.organizationId,
        patientId: invoice.patientId,
        eventType: 'PAYMENT_COLLECTED',
        eventCategory: 'BILLING',
        title: 'Online payment received',
        description: `${amount.toFixed(2)} paid online against ${invoice.invoiceNumber}`,
        metadata: { invoiceId: invoice.id, paymentId: created.id, provider: 'stripe' },
      });
      await this.audit.log({
        organizationId: invoice.organizationId,
        action: 'PAYMENT_RECEIVED_ONLINE',
        resource: 'payment',
        resourceId: created.id,
        afterData: { invoiceId: invoice.id, amount: amount.toFixed(2), sessionId: session.id },
      });
    }
    return invoice.organizationId;
  }

  /** Mirrors a Stripe refund (made here or in the Stripe dashboard) into the ledger. */
  private async syncStripeRefund(r: any): Promise<string | null> {
    const pi = typeof r.payment_intent === 'string' ? r.payment_intent : r.payment_intent?.id;
    if (!pi) return null;
    const payment = await this.prisma.payment.findFirst({
      where: { paymentMethod: 'STRIPE', transactionReference: pi, isRefund: false },
    });
    if (!payment) return null;
    const status = STRIPE_REFUND_STATUS[r.status] ?? 'PENDING';

    let existing = r.metadata?.refundId
      ? await this.prisma.refund.findFirst({ where: { id: r.metadata.refundId, paymentId: payment.id } })
      : null;
    if (!existing) {
      existing = await this.prisma.refund.findFirst({
        where: { paymentId: payment.id, reason: { contains: r.id } },
      });
    }
    if (existing) {
      if (existing.status !== status) await this.applyStripeRefundStatus(existing.id, r.status);
      return payment.organizationId;
    }

    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.ledger.lockInvoice(tx, payment.invoiceId, payment.organizationId);
      await tx.refund.create({
        data: {
          organizationId: payment.organizationId,
          branchId: payment.branchId,
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount: fromMinorUnits(Number(r.amount ?? 0), r.currency ?? this.stripe.currency()),
          reason: `Refunded in Stripe (${r.id})${r.reason ? `: ${r.reason}` : ''}`,
          status,
          processedAt: status === 'COMPLETED' ? new Date() : null,
        },
      });
      await this.ledger.syncPaymentRefundStatus(payment.id, tx);
      await this.ledger.syncStatus(invoice, tx);
    });
    return payment.organizationId;
  }

  // ---------------------------------------------------------------- public status

  async publicStatus(invoiceId: string | undefined) {
    if (!invoiceId) throw new BadRequestException('invoice is required');
    assertUuid(invoiceId, 'invoice');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: { id: true, status: true, organization: { select: { name: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const { net } = await this.ledger.balance(invoice.id);
    return { status: invoice.status, amountPaid: D(net).toFixed(2), clinicName: invoice.organization.name };
  }
}
