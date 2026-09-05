import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InitialRoleDto {
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

// Create User (Identity, Roles & Assignments) -- person + login identifier + initial
// credential + one starting role assignment, in a single flow. Role-specific subtype
// fields (student admission number, staff employee number, ...) are intentionally out
// of scope here; they belong to Student Records / Faculty & Staff once those modules
// exist, added on top of the person this creates.
export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsIn(['EMAIL', 'MOBILE'])
  identifierType!: 'EMAIL' | 'MOBILE';

  @IsString()
  @MinLength(1)
  identifierValue!: string;

  // If omitted, a temporary password is generated and returned once in the response --
  // same pattern as the existing admin parent-password-reset endpoint.
  @IsOptional()
  @IsString()
  @MinLength(8)
  initialPassword?: string;

  @ValidateNested()
  @Type(() => InitialRoleDto)
  initialRole!: InitialRoleDto;
}
