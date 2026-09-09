import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsIn(['CORE', 'LANGUAGE', 'OPTIONAL', 'VOCATIONAL', 'CO_SCHOLASTIC'])
  subjectType!: string;

  @IsOptional()
  @IsIn(['PRE_PRIMARY', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY'])
  appliesToStage?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
