// Global exception filter.
//
// Deliberately does NOT wrap responses in a {success,error,meta} envelope: the Auth
// module's contract is exact flat JSON — { message, error, statusCode } — which is
// simply Nest's default HttpException body, so we pass it through unchanged. This
// filter's job is safety, not reshaping: never let a password/token reach a log line,
// and never leak an internal stack trace to the client.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'otp',
  'accessToken',
  'refreshToken',
  'passwordHash',
  'mfaSecret',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redact(val);
    }
    return out;
  }
  return value;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} -> ${status}: ${exception.message}`,
        );
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} -> 500 unhandled: ${(exception as Error)?.message}`,
      { body: redact(request.body) },
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      error: 'Internal Server Error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
