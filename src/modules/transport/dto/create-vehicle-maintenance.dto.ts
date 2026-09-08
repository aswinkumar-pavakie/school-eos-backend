import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateVehicleMaintenanceDto {
  @IsIn(['SERVICE', 'REPAIR', 'TYRE', 'BATTERY', 'BODY', 'OTHER'])
  maintenanceType!: string;

  @IsDateString()
  performedOn!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPaise?: number;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
