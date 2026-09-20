import { IsISO8601, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePracticePlanDto {
  @IsUUID()
  teamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  // Keyed by weekday name -> free-text focus (e.g. { MONDAY: 'Fitness' }).
  // Validated for shape (plain object) here; per-key weekday/string
  // correctness is the repository's own concern, same as this codebase's
  // other JSONB-backed fields.
  @IsOptional()
  @IsObject()
  weeklyFocus?: Record<string, string>;
}
