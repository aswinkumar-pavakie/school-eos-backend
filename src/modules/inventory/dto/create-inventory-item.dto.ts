import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Optional here only so MediaInventoryController can inject its own fixed
  // category server-side, after this DTO's own validation runs (the client never
  // sends it there) -- category_id itself stays NOT NULL at the DB level
  // regardless, so a caller that genuinely omits it (Admin's own real usage always
  // sends one) still fails at the database, not silently.
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  assetCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

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
