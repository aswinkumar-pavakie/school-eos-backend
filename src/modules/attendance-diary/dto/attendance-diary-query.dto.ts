import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Strict calendar date (no time, no timezone) -- the diary is a per-day view.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Comma-separated id list -> validated string[] (repeated ?a=1&a=2 would be
// ambiguous across the website/mobile clients; one explicit format is safer).
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.length > 0
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;

class DiaryPageDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  // Free-text search (name / admission no / employee no). Length-capped; the
  // repository escapes LIKE wildcards, so this is never a pattern.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class StudentDiaryQueryDto extends DiaryPageDto {
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  gradeIds?: string[];

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(80)
  @IsUUID('all', { each: true })
  sectionIds?: string[];

  // That day's status.
  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'NOT_MARKED'])
  dayStatus?: string;

  // Year-to-date attendance percentage band.
  @IsOptional()
  @IsIn(['LT60', 'LT75', 'BETWEEN_75_90', 'GTE90'])
  percentBand?: string;

  @IsOptional()
  @IsIn(['HOSTEL', 'DAY_SCHOLAR'])
  residence?: string;

  @IsOptional()
  @IsIn(['BUS', 'NO_BUS'])
  transport?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: string;

  @IsOptional()
  @IsIn(['NAME', 'CLASS', 'PERCENT_ASC', 'PERCENT_DESC'])
  sort?: string;
}

export class EmployeeDiaryQueryDto extends DiaryPageDto {
  @IsOptional()
  @IsIn(['PRINCIPAL', 'VICE_PRINCIPAL', 'FACULTY'])
  group?: string;

  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT', 'ON_DUTY', 'ON_LEAVE', 'NOT_MARKED'])
  dayStatus?: string;

  @IsOptional()
  @IsIn(['LT60', 'LT75', 'BETWEEN_75_90', 'GTE90'])
  percentBand?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsIn(['NAME', 'PERCENT_ASC', 'PERCENT_DESC'])
  sort?: string;
}

export class DiaryContextQueryDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}
