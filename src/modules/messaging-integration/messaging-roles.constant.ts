// The documented, explicit answer to "which roles are messagingEnabled" — see
// the approved plan's "Explicit assumptions" section. No `messaging_enabled`
// column exists anywhere in this schema; the LLD's own rules (§10-16, §27) are
// entirely role-driven, so this list IS the definition, not a cache of one.
//
// ADMIN/FINANCE/BUS_ATTENDANT/CANTEEN_VENDOR are explicitly excluded by the
// LLD by name. Every other role this codebase knows about
// (ACADEMIC_COORDINATOR, COMMUNITY_INCHARGE, HEALTH_INCHARGE, SPORTS_FACULTY,
// TRANSPORT_MANAGER, MEDIA_ROOM) is simply never addressed by the LLD at all —
// those default to NOT messaging-enabled, fail-closed, not a broadened
// permission. CLASS_ADVISOR/ACADEMIC_COORDINATOR are assignment labels layered
// on the base FACULTY role_code (a Faculty member always also carries the
// base FACULTY role_code), so they're already covered via FACULTY here, not
// listed separately.
export const MESSAGING_ENABLED_ROLE_CODES = [
  'PARENT',
  'FACULTY',
  'HOSTEL_WARDEN',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
] as const;
