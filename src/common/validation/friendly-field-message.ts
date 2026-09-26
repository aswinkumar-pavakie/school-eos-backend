// Maps a class-validator constraint key (the property name inside a
// ValidationError's `constraints` object, e.g. "isNotEmpty", "isEmail") to a
// short, user-facing phrase -- used only to build the additive `fieldErrors`
// array (validation.pipe.ts). The existing `message` array is untouched and
// still carries class-validator's own default strings, so nothing that reads
// `message` today is affected by this file at all.
//
// Deliberately not exhaustive: a constraint key with no entry here falls back
// to class-validator's own message for that field (see friendlyFieldMessage
// below) rather than inventing wording for a case we haven't actually seen in
// this codebase's DTOs.
const FRIENDLY_BY_CONSTRAINT: Record<string, string> = {
  isNotEmpty: 'is required.',
  isDefined: 'is required.',
  isString: 'must be text.',
  isEmail: 'must be a valid email address.',
  isNumber: 'must be a number.',
  isInt: 'must be a whole number.',
  isPositive: 'must be a positive number.',
  isBoolean: 'must be true or false.',
  isDateString: 'must be a valid date.',
  isDate: 'must be a valid date.',
  isUUID: 'is not a valid value.',
  isEnum: 'is not one of the allowed options.',
  isIn: 'is not one of the allowed options.',
  isArray: 'must be a list.',
  arrayMinSize: 'must have at least one item.',
  arrayNotEmpty: 'must have at least one item.',
  minLength: 'is too short.',
  maxLength: 'is too long.',
  min: 'is too small.',
  max: 'is too large.',
  isPhoneNumber: 'must be a valid phone number.',
  isMobilePhone: 'must be a valid phone number.',
  matches: 'is not in the expected format.',
};

// class-validator field names are camelCase DTO properties (e.g.
// "identifierValue") -- split into words so the sentence reads naturally
// ("Identifier value is required.") without a manual label per DTO.
function humanizeFieldName(field: string): string {
  const last = field.split('.').pop() ?? field;
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Given the first constraint key/value for a field, returns a friendly
 * sentence if this constraint type is known, otherwise falls back to
 * class-validator's own message unchanged (never invents wording). */
export function friendlyFieldMessage(
  field: string,
  constraintKey: string,
  originalMessage: string,
): string {
  const phrase = FRIENDLY_BY_CONSTRAINT[constraintKey];
  if (!phrase) return originalMessage;
  return `${humanizeFieldName(field)} ${phrase}`;
}
