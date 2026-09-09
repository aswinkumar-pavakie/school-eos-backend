import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateCopyDto {
  @IsOptional()
  @IsString()
  copyCode?: string;

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
