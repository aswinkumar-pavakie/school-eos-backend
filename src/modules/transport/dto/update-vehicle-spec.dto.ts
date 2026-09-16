import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateVehicleSpecDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  yearOfManufacture?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bodyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  chassisNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  engineNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  engineDesc?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  wheelbaseMm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tyreSize?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tyreCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fuelTankLitres?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rtoOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  parkingBay?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentOdometerKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nextServiceDueKm?: number;
}
