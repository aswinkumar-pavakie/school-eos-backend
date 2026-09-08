import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateGradeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(-2)
  @Max(12)
  levelNo!: number;

  @IsIn(['PRE_PRIMARY', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY'])
  stage!: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
