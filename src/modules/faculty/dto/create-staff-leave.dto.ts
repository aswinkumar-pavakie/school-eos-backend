import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const LEAVE_TYPES = ['CASUAL', 'MEDICAL', 'EARNED', 'ON_DUTY'];

export class CreateStaffLeaveDto {
  @IsIn(LEAVE_TYPES)
  leaveType!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  attachmentObjectKey?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;
}
