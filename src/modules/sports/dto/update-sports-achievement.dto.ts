import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSportsAchievementDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  placement?: string;

  @IsOptional()
  @IsIn(['SCHOOL', 'BLOCK', 'DISTRICT', 'STATE', 'NATIONAL', 'INTERNATIONAL'])
  level?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  awardedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
