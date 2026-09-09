import { IsIn, IsOptional, IsString } from 'class-validator';

export class GrantRoleAssignmentDto {
  @IsString()
  personId!: string;

  @IsString()
  roleCode!: string;

  @IsIn([
    'SCHOOL',
    'CAMPUS',
    'STAGE',
    'GRADE',
    'SECTION',
    'SUBJECT_OFFERING',
    'COMMUNITY',
    'HOSTEL',
    'BUS',
    'TEAM',
    'TERMINAL',
    'VENDOR',
  ])
  scopeType!: string;

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsOptional()
  @IsIn(['PRE_PRIMARY', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY'])
  scopeStage?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}
