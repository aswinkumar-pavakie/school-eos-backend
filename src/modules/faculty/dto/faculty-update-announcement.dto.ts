import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

// Everything optional -- only what's present gets changed. targetSectionIds,
// when given, replaces the whole audience (still SECTION-only, still
// re-validated against the caller's own scope in the controller).
export class FacultyUpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetSectionIds?: string[];
}
