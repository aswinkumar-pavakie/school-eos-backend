// Global ValidationPipe config: strips unknown fields, rejects requests carrying them,
// and coerces payloads to their DTO classes so class-validator decorators run.

import { BadRequestException, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common/interfaces/external/validation-error.interface';
import { friendlyFieldMessage } from './friendly-field-message';

// Mirrors @nestjs/common's own ValidationPipe.flattenValidationErrors exactly
// (same recursion, same parentPath.property dot-joining, same
// "only entries with constraints" filter) so `message` stays byte-identical
// to what every existing caller already parses today. See
// node_modules/@nestjs/common/pipes/validation.pipe.js for the original this
// is copied from -- kept in sync deliberately rather than reaching into an
// internal, non-exported class method.
function mapChildrenToValidationErrors(
  error: ValidationError,
  parentPath?: string,
): ValidationError[] {
  if (!(error.children && error.children.length)) {
    return [error];
  }
  const validationErrors: ValidationError[] = [];
  const path = parentPath ? `${parentPath}.${error.property}` : error.property;
  for (const item of error.children) {
    if (item.children && item.children.length) {
      validationErrors.push(...mapChildrenToValidationErrors(item, path));
    }
    validationErrors.push(prependConstraintsWithParentProp(path, item));
  }
  return validationErrors;
}

function prependConstraintsWithParentProp(
  parentPath: string,
  error: ValidationError,
): ValidationError {
  const constraints: Record<string, string> = {};
  for (const key in error.constraints) {
    constraints[key] = `${parentPath}.${error.constraints[key]}`;
  }
  return { ...error, property: `${parentPath}.${error.property}`, constraints };
}

function flattenValidationErrors(validationErrors: ValidationError[]): string[] {
  return validationErrors
    .map((error) => mapChildrenToValidationErrors(error))
    .flat()
    .filter((item) => !!item.constraints)
    .map((item) => Object.values(item.constraints!))
    .flat();
}

// Additive only: one friendly {field, message} per top-level field (first
// constraint wins, same "first message per field" convention the website's
// own form-errors.ts already uses) -- never replaces `message` above.
function buildFieldErrors(
  validationErrors: ValidationError[],
): { field: string; message: string }[] {
  const flattened = validationErrors
    .map((error) => mapChildrenToValidationErrors(error))
    .flat()
    .filter((item) => !!item.constraints);

  const fieldErrors: { field: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const item of flattened) {
    if (seen.has(item.property)) continue;
    seen.add(item.property);
    const [constraintKey, originalMessage] = Object.entries(item.constraints!)[0];
    fieldErrors.push({
      field: item.property,
      message: friendlyFieldMessage(item.property, constraintKey, originalMessage),
    });
  }
  return fieldErrors;
}

export const validationPipeConfig: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: (validationErrors: ValidationError[] = []) => {
    const message = flattenValidationErrors(validationErrors);
    const fieldErrors = buildFieldErrors(validationErrors);
    // Passing a plain object (not an array/string) makes Nest return it
    // completely verbatim as the response body (see HttpException.createBody)
    // -- so message/error/statusCode are exactly what the default factory
    // would have produced, with fieldErrors/code added alongside, never
    // replacing anything an existing client already reads.
    return new BadRequestException({
      message,
      error: 'Bad Request',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors,
    });
  },
};

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(validationPipeConfig);
}
