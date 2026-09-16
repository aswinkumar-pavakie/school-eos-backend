import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
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
  // Mobile and web are separate origins calling this API directly.
  app.enableCors();

  setupReadOnlySwagger(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
