import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// The real complaint.category CHECK constraint (verified live against the actual DB,
// not assumed) is a top-level classification -- 'HOSTEL' is already one of its values,
// and every complaint this feature creates uses it, hardcoded server-side (never
// client-supplied). The finer-grained "what kind of hostel issue" the task actually
// asks for (fan, plumbing, water leakage, ...) has no existing column to reuse, so it
// goes into the new `hostel_issue_type` column documented in query.md alongside
// hostel_id/block_id/room_id.
export const HOSTEL_ISSUE_TYPES = [
  'ELECTRICAL',
  'PLUMBING',
  'WATER_LEAKAGE',
  'BATHROOM',
  'FURNITURE_DAMAGE',
  'CLEANING',
  'OTHER',
] as const;

export class CreateHostelComplaintDto {
  @IsOptional()
  @IsUUID()
  blockId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsIn(HOSTEL_ISSUE_TYPES)
  issueType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;
}
