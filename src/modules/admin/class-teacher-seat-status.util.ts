// The status pill on the admin's class-login table, decided in one place so the
// table, the rollover preview and the tests all agree. See
// school-eos-website/rnd-class-teacher-logins-admin.md section 3.

export type SeatStatus =
  | 'ACTIVE'
  | 'VACANT'
  | 'NEEDS_ROLLOVER'
  | 'NO_SECTION_THIS_YEAR'
  | 'HOLDER_INACTIVE';

export interface SeatStatusInput {
  /** Whether an ACTIVE holder assignment exists. */
  hasHolder: boolean;
  /** The holder's staff.status, if there is a holder. */
  holderStaffStatus: string | null;
  /** This grade + section name's row in the selected academic year. */
  targetSectionId: string | null;
  /** The section the login's CLASS_ADVISOR role currently points at. */
  roleSectionId: string | null;
}

/**
 * Order matters:
 *  1. No section this year  -- nothing to attach the login to at all.
 *  2. Vacant                -- nobody stands behind the login.
 *  3. Needs rollover        -- the login still points at an older year's
 *                              section, so it resolves to nothing today.
 *  4. Holder inactive       -- the person exited / is on leave.
 *  5. Active.
 */
export function computeSeatStatus(input: SeatStatusInput): SeatStatus {
  if (!input.targetSectionId) return 'NO_SECTION_THIS_YEAR';
  if (!input.hasHolder) return 'VACANT';
  if (input.roleSectionId !== input.targetSectionId) return 'NEEDS_ROLLOVER';
  if (input.holderStaffStatus !== 'ACTIVE') return 'HOLDER_INACTIVE';
  return 'ACTIVE';
}
