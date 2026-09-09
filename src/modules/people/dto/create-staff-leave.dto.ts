import { IsDateString, IsIn, IsString, MinLength } from 'class-validator';

const LEAVE_TYPES = ['CASUAL', 'MEDICAL', 'EARNED', 'ON_DUTY'];

export class CreateStaffLeaveDto {
  @IsIn(LEAVE_TYPES)
  leaveType!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
