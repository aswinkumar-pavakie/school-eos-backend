import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGradeScaleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['MARKS', 'PERCENTAGE', 'GRADE'])
  scaleType!: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
