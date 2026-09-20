import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSubstituteCoachDto {
  @IsUUID()
  teamId!: string;

  @IsOptional()
  @IsUUID()
  originalCoachId?: string;

  @IsUUID()
  substituteCoachId!: string;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
