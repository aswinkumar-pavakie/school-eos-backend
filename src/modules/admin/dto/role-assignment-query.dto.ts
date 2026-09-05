import { IsIn, IsOptional, IsString } from 'class-validator';

export class RoleAssignmentQueryDto {
  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  roleCode?: string;

  @IsOptional()
  @IsString()
  scopeType?: string;

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'REVOKED', 'EXPIRED'])
  status?: string;
}
