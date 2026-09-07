import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_PATTERN_MESSAGE = 'must be in HH:mm 24-hour format';

// Deliberately excludes academicYearId/sectionId/permissionType/studentIds/
// createdByStaffId -- none of those may ever change post-creation (see module
// README "Update behavior"). Only activity logistics can be corrected.
export class UpdatePermissionActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  activityDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: `startTime ${TIME_PATTERN_MESSAGE}` })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: `endTime ${TIME_PATTERN_MESSAGE}` })
  endTime?: string;

  @IsOptional()
  @IsDateString()
  responseDeadline?: string;
}
