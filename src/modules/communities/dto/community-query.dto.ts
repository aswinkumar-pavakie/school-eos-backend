import { IsIn, IsOptional, IsString } from 'class-validator';

export class CommunityQueryDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'])
  state?: string;
}
