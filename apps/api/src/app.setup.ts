import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Applies the HTTP middleware, validation, error and response conventions.
 * Used by main.ts and by the e2e harness so tests exercise the real pipeline.
 */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const express = app as unknown as { set?: (k: string, v: unknown) => void };

  if (config.get<boolean>('TRUST_PROXY') && typeof express.set === 'function') {
    express.set('trust proxy', 1);
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  const bodyLimit = `${config.get<number>('MAX_JSON_BODY_MB') ?? 2}mb`;
  // Keep the exact bytes for webhook signature checks (Stripe): these parsers run before
  // Nest's own rawBody-aware parsers, so they must populate req.rawBody themselves.
  const keepRaw = (req: any, _res: unknown, buf: Buffer) => {
    if (buf?.length) req.rawBody = buf;
  };
  app.use(json({ limit: bodyLimit, verify: keepRaw }));
  app.use(urlencoded({ extended: true, limit: bodyLimit, verify: keepRaw }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const origins = (config.get<string>('CORS_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Branch-Id'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  app.enableShutdownHooks();
  return app;
}
