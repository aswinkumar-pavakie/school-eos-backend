import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateGradeScaleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['MARKS', 'PERCENTAGE', 'GRADE'])
  scaleType?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
