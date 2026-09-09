import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateSportDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'TEAM'])
  sportType?: string;

  @IsOptional()
  @IsIn(['POINTS', 'TIME', 'DISTANCE', 'SETS', 'PLACEMENT'])
  resultType?: string;

  @IsOptional()
  @IsObject()
  scoringTemplate?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
