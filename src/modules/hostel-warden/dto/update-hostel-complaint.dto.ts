import { IsIn } from 'class-validator';

// Matches complaint's real state CHECK constraint exactly (verified live) --
// OPEN, IN_PROGRESS, ESCALATED, RESOLVED, CLOSED, REJECTED. No ASSIGNED state exists
// on the real table (assigned_to is a separate nullable column, Admin-set).
export const HOSTEL_COMPLAINT_STATES = [
  'OPEN',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
] as const;

export class UpdateHostelComplaintDto {
  @IsIn(HOSTEL_COMPLAINT_STATES)
  state!: string;
}
