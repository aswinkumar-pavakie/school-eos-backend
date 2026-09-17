import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMediaReportMetricDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nowValue?: string;

  @IsOptional()
  @IsString()
  targetValue?: string;

  @IsOptional()
  @IsString()
  attainmentPct?: string;
}
