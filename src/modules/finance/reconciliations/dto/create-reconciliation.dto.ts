import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateReconciliationDto {
  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @IsISO8601({ strict: true })
  periodFrom!: string;

  @IsISO8601({ strict: true })
  periodTo!: string;

  @IsOptional()
  @IsString()
  settlementObjectKey?: string;
}
