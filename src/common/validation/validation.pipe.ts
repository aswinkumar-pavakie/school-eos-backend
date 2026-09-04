// Global ValidationPipe config: strips unknown fields, rejects requests carrying them,
// and coerces payloads to their DTO classes so class-validator decorators run.

import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

export const validationPipeConfig: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(validationPipeConfig);
}
