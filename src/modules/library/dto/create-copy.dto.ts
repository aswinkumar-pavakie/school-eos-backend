import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCopyDto {
  @IsString()
  @IsNotEmpty()
  copyCode!: string;

  @IsOptional()
  @IsString()
  shelfLocation?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  acquisitionCostPaise?: number;
}
