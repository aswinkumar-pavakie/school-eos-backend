import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMediaReportMetricDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  nowValue!: string;

  @IsOptional()
  @IsString()
  targetValue?: string;

  @IsOptional()
  @IsString()
  attainmentPct?: string;
}
