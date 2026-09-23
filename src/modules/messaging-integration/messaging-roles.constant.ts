// The documented, explicit answer to "which roles are messagingEnabled" — see
// the approved plan's "Explicit assumptions" section. No `messaging_enabled`
// column exists anywhere in this schema; the LLD's own rules (§10-16, §27) are
// entirely role-driven, so this list IS the definition, not a cache of one.
//
// SUPERSEDED: the original LLD narrowly enabled only PARENT/FACULTY/
// HOSTEL_WARDEN/PRINCIPAL/VICE_PRINCIPAL and excluded ADMIN/FINANCE by name.
// The user's own explicit later instruction widened this to every real login
// role EXCEPT CANTEEN_VENDOR, DRIVER, and BUS_ATTENDANT (device-credential-only
// logins with no person-to-person messaging use case) — this list now reflects
// that decision, not the original LLD's narrower one. CLASS_ADVISOR/
// ACADEMIC_COORDINATOR are assignment labels layered on the base FACULTY
// role_code (a Faculty member always also carries the base FACULTY role_code),
// so they're already covered via FACULTY here, not listed separately.
export const MESSAGING_ENABLED_ROLE_CODES = [
  'PARENT',
  'FACULTY',
  'HOSTEL_WARDEN',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'ADMIN',
  'CORRESPONDENT',
  'TRANSPORT_MANAGER',
  'LIBRARY',
  'FINANCE',
  'MEDIA_ROOM',
  'SPORTS_ADMIN',
  'COMMUNITY',
] as const;
