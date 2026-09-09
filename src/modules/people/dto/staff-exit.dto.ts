import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class StaffExitDto {
  @IsIn(['RESIGNED', 'RETIRED', 'TRANSFERRED', 'TERMINATED'])
  exitReason!: string;

  // Defaults to today if omitted.
  @IsOptional()
  @IsDateString()
  dateOfExit?: string;
}
