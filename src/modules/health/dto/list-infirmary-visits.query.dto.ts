import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListInfirmaryVisitsQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsIn(['REST', 'MEDICATION', 'SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT', 'NO_ACTION'])
  action?: string;
}
