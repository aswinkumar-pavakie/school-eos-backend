import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSportsInjuryDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsISO8601({ strict: true })
  incidentDate!: string;

  @IsBoolean()
  guardianInformed!: boolean;
}
