import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSportDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['INDIVIDUAL', 'TEAM'])
  sportType!: string;

  @IsIn(['POINTS', 'TIME', 'DISTANCE', 'SETS', 'PLACEMENT'])
  resultType!: string;

  @IsOptional()
  @IsObject()
  scoringTemplate?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
