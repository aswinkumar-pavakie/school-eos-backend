// The fixed, small set of request types Admin is actually authorized to
// decide -- everything else (academic, disciplinary, staff-performance,
// finance operations, bus/canteen NFC) stays with Principal/Vice
// Principal/Finance and is deliberately not represented here. Enforced both
// at the DTO layer (@IsIn) and again in the service (belt-and-braces against
// a future request_type sneaking in through some other path).
export const ADMIN_REQUEST_TYPES = [
  'ADMIN_ACCESS_REQUEST',
  'ATTENDANCE_CORRECTION_REQUEST',
  'STUDENT_RECORD_CORRECTION_REQUEST',
  'INVENTORY_REQUEST',
  'REPAIR_MAINTENANCE_REQUEST',
  'ADMIN_OTHER_REQUEST',
] as const;

export type AdminRequestType = (typeof ADMIN_REQUEST_TYPES)[number];
