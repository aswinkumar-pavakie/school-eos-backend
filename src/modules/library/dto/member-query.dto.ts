import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class MemberQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'INACTIVE'])
  status?: string;

  @IsOptional()
  @IsIn(['STUDENT', 'STAFF'])
  memberType?: string;

  /** Student-only filters -- a STAFF member has no section, so it simply never
   * matches when either of these is set. */
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

export class EligibleMemberQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
