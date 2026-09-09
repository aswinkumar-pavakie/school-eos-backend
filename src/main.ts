import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { EmptyQueryValuePipe } from './common/validation/empty-query-value.pipe';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { createValidationPipe } from './common/validation/validation.pipe';

async function bootstrap(): Promise<void> {
  // rawBody: true attaches the unparsed request buffer as req.rawBody on every
  // request (Nest/Express built-in) — needed only by PaymentWebhookGuard, to verify
  // the payment gateway's HMAC signature over bytes-as-sent rather than the
  // re-serialized parsed body, which is not guaranteed to match byte-for-byte.
  // NestExpressApplication (rather than the bare interface) is what Admin's own
  // static-asset serving needs typed access to.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new EmptyQueryValuePipe(), createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  // Mobile and web are separate origins calling this API directly.
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
