// Expiry is never physically written -- there is no cron/background job (none
// requested, none exists in this codebase). A PENDING request past its activity's
// response_deadline is treated as EXPIRED live, by every read and every
// authorization/consent check, computed fresh each time against the current clock.

import type { PermissionRequestStatus } from './repositories/permission-request.repository';

/** response_deadline is a date-only column -- treated as expiring at the end of
 * that calendar day (23:59:59 local), not at midnight, so "respond by 10 Sept"
 * genuinely means the parent has all of the 10th. */
export function isPastDeadline(
  responseDeadline: string,
  now: Date = new Date(),
): boolean {
  const deadline = new Date(`${responseDeadline}T23:59:59`);
  return deadline.getTime() < now.getTime();
}

/** The status callers should actually see/act on -- reclassifies a still-PENDING
 * row whose deadline has passed as EXPIRED, without requiring the stored column to
 * have been rewritten. Every other status passes through unchanged. */
export function effectiveStatus(
  storedStatus: PermissionRequestStatus,
  responseDeadline: string,
  now: Date = new Date(),
): PermissionRequestStatus {
  if (storedStatus === 'PENDING' && isPastDeadline(responseDeadline, now)) {
    return 'EXPIRED';
  }
  return storedStatus;
}
