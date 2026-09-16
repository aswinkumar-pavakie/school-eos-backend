import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAchievementDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsIn(['SCHOOL', 'BLOCK', 'DISTRICT', 'STATE', 'NATIONAL', 'INTERNATIONAL'])
  level!: string;

  @IsDateString()
  awardedOn!: string;

  @IsOptional()
  @IsIn(['SPORTS', 'COMMUNITY', 'ACADEMICS', 'CAMP', 'EXTERNAL'])
  sourceDomain?: string;
}
