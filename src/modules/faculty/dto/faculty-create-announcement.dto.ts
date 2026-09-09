import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

// A Faculty announcement is always SECTION-audienced -- one or more of the
// caller's own scoped classes (advisor + teaching, enforced in the
// controller/service, never trusted from the client). There is no
// audienceType field here at all: unlike the ADMIN dto, Faculty can't choose
// SCHOOL/ROLE.
export class FacultyCreateAnnouncementDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetSectionIds!: string[];
}
