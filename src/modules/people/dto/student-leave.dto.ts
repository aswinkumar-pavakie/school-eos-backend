import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class StudentLeaveDto {
  @IsIn(['LEFT', 'TC_ISSUED', 'ARCHIVED'])
  status!: string;

  // Defaults to today if omitted.
  @IsOptional()
  @IsDateString()
  dateOfLeaving?: string;
}
