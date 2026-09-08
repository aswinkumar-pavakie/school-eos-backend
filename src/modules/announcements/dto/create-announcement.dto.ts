import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

// Simplified client-facing shape -- audienceType 'SCHOOL' needs nothing else;
// 'ROLE' needs one or more real role codes (validated against the role table by
// the service, same as the existing role-assignment grant flow); 'SECTION'
// needs one or more real section ids (the Faculty module's own use -- see
// FacultyAnnouncementsController, which further restricts this to sections
// the caller actually teaches or advises). GRADE/COMMUNITY/HOSTEL/ROUTE/PERSON
// audiences exist in the schema but aren't exposed here yet -- not asked for,
// and each needs its own picker UI.
export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsIn(PRIORITIES)
  priority!: string;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsIn(['SCHOOL', 'ROLE', 'SECTION'])
  audienceType!: string;

  // Required (checked in the service) when audienceType is 'ROLE'.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetRoles?: string[];

  // Required (checked in the service) when audienceType is 'SECTION'.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetSectionIds?: string[];
}
