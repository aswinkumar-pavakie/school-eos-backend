import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateStudySessionDto {
  // Only meaningful for a Warden covering more than one hostel -- defaults to the
  // caller's own (sole) hostel otherwise. Validated against the caller's real
  // role_assignment, never trusted outright.
  @IsOptional()
  @IsUUID()
  hostelId?: string;

  @IsDateString()
  sessionDate!: string;

  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime!: string;
}
