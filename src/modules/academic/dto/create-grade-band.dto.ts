import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGradeBandDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxPercent!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gradePoint?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
