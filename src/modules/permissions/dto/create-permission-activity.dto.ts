import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_PATTERN_MESSAGE = 'must be in HH:mm 24-hour format';

export const PERMISSION_TYPES = [
  'ONE_TIME_ACTIVITY',
  'ANNUAL_CONSENT',
  'TERM_CONSENT',
  'MEDIA_CONSENT',
  'TRIP',
  'SPORTS',
  'OTHER',
] as const;

// Only the fields the approved faculty form has -- no location, no consent
// statement, matching the approved screenshot exactly.
export class CreatePermissionActivityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(PERMISSION_TYPES)
  permissionType!: (typeof PERMISSION_TYPES)[number];

  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  sectionId!: string;

  @IsDateString()
  activityDate!: string;

  @Matches(TIME_PATTERN, { message: `startTime ${TIME_PATTERN_MESSAGE}` })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: `endTime ${TIME_PATTERN_MESSAGE}` })
  endTime!: string;

  @IsDateString()
  responseDeadline!: string;

  // true = resolve every ACTIVE student in the section server-side (never
  // client-supplied); false = validate each id in studentIds independently.
  @IsBoolean()
  allStudents!: boolean;

  @ValidateIf((o: CreatePermissionActivityDto) => o.allStudents === false)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  studentIds?: string[];
}
