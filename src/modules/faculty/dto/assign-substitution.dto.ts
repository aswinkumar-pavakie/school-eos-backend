import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignSubstitutionDto {
  @IsUUID()
  timetableSlotId!: string;

  @IsUUID()
  originalStaffId!: string;

  @IsUUID()
  substituteStaffId!: string;

  @IsDateString()
  subDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
