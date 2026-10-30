import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

const LOG_LEVELS: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

async function bootstrap() {
  const logLevel = process.env.LOG_LEVEL || 'log';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: LOG_LEVELS[logLevel] ?? LOG_LEVELS.log,
    // Raw body is kept so provider webhooks (Stripe, Twilio) can verify signatures.
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const sentryDsn = config.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: Number(config.get('SENTRY_TRACES_SAMPLE_RATE') ?? 0.1),
      environment: config.get<string>('NODE_ENV') || 'development',
      sendDefaultPii: false,
    });
  }

  configureApp(app);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`ClinicPlus API listening on port ${port} (${config.get('NODE_ENV')})`);
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal: API failed to start', err instanceof Error ? err.message : err);
  process.exit(1);
});
