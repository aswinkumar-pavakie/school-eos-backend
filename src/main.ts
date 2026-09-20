import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { EmptyQueryValuePipe } from './common/validation/empty-query-value.pipe';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { createValidationPipe } from './common/validation/validation.pipe';
import { setupReadOnlySwagger } from './swagger';

async function bootstrap(): Promise<void> {
  // rawBody: true attaches the unparsed request buffer as req.rawBody on every
  // request (Nest/Express built-in) — needed only by PaymentWebhookGuard, to verify
  // the payment gateway's HMAC signature over bytes-as-sent rather than the
  // re-serialized parsed body, which is not guaranteed to match byte-for-byte.
  // NestExpressApplication (rather than the bare interface) is what Admin's own
  // static-asset serving needs typed access to.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // messaging-integration's own routes are deliberately NOT part of the
  // versioned public API surface (see its README/controller header comment:
  // "never mounted under the versioned public /api/v1/* prefix") -- excluded
  // here so they stay reachable at exactly /internal/v1/messaging/*, matching
  // what school-eos-messaging's own CORE_INTERNAL_BASE_URL actually points at.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'internal/v1/messaging/*path', method: RequestMethod.ALL }],
  });
  app.useGlobalPipes(new EmptyQueryValuePipe(), createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Standard HTTP security headers (X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, etc.) -- purely additive, no behavior change
  // for any existing endpoint. CSP is left disabled: this API serves pure
  // JSON (never HTML), so a content-security-policy header has no real
  // target here and risks breaking the read-only Swagger UI this app also
  // serves (setupReadOnlySwagger below).
  app.use(helmet({ contentSecurityPolicy: false }));

  // Mobile and web are separate origins calling this API directly. Native
  // Expo/React Native fetch doesn't send an Origin header at all, so CORS
  // enforcement here only ever affects browser (website) traffic. Wide open
  // by default (unchanged from before) so nothing breaks pre-launch; set
  // CORS_ALLOWED_ORIGINS (comma-separated) in production to lock this down
  // to the real deployed website origin(s) before go-live.
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors(allowedOrigins?.length ? { origin: allowedOrigins, credentials: true } : undefined);

  setupReadOnlySwagger(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
