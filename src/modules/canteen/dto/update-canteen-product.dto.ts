import { IsBoolean, IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCanteenProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerUnitPaise?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  // true = "clear the existing image, don't replace it" -- distinguished
  // from "no new file was attached, leave the current image alone" (the
  // ordinary no-file-in-this-request case), same way removePhoto is its own
  // separate endpoint for Person photos rather than an implicit DELETE-file
  // meaning inside an update.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  removeImage?: boolean;
}
