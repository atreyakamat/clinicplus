import { Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TwilioWebhookService } from './twilio-webhook.service';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * Public Twilio webhooks (no JWT). Every request must carry a valid X-Twilio-Signature.
 * Configure in the Twilio console:
 *   - Messaging "A message comes in":  POST {API_PUBLIC_URL}/api/v1/webhooks/twilio/inbound
 *   - Status callback (sent automatically per message): {API_PUBLIC_URL}/api/v1/webhooks/twilio/status
 */
@Controller('api/v1/webhooks/twilio')
export class TwilioWebhookController {
  constructor(private readonly service: TwilioWebhookService) {}

  private verify(req: Request, signature?: string) {
    const origin = `${req.protocol}://${req.get('host')}`;
    this.service.assertSignature(req.originalUrl, origin, (req.body ?? {}) as Record<string, unknown>, signature);
  }

  @Post('status')
  @HttpCode(200)
  async status(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') signature?: string) {
    this.verify(req, signature);
    await this.service.handleStatus((req.body ?? {}) as Record<string, any>);
    res.status(200).type('text/xml').send(EMPTY_TWIML);
  }

  @Post('inbound')
  @HttpCode(200)
  async inbound(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') signature?: string) {
    this.verify(req, signature);
    await this.service.handleInbound((req.body ?? {}) as Record<string, any>);
    // Empty TwiML: no auto-reply (Twilio sends its own STOP/START confirmations for SMS).
    res.status(200).type('text/xml').send(EMPTY_TWIML);
  }
}
