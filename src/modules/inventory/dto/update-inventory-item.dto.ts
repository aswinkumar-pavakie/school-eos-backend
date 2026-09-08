import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

// Plain field edit only -- never quantity or status/assignment, which each have
// their own dedicated action endpoint (see InventoryItemsController).
export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  assetCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  acquisitionCostPaise?: number;

  @IsOptional()
  @IsString()
  vendor?: string;
}
