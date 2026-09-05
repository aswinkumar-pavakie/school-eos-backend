import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class IdCardQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'LOST', 'DAMAGED', 'BLOCKED', 'REPLACED', 'EXPIRED'])
  status?: string;
}
