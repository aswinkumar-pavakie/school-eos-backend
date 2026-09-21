import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityAvailable?: number;

  @IsOptional()
  @IsIn(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])
  condition?: string;

  // Real soft-delete path -- see migration 0025_equipment_status.sql and
  // equipment.repository.ts's own comment; there is no hard-delete route.
  @IsOptional()
  @IsIn(['ACTIVE', 'RETIRED'])
  status?: string;
}
