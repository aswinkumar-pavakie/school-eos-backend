import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpsertTimetableSlotDto {
  @IsUUID()
  sectionId!: string;

  /** 1-7, matching timetable_slot's own CHECK constraint (this schema's real data only ever uses 1-6, Mon-Sat). */
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @IsUUID()
  periodId!: string;

  @IsUUID()
  subjectOfferingId!: string;

  @IsOptional()
  @IsString()
  room?: string;
}
