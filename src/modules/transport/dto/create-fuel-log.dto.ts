import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateFuelLogDto {
  @IsDateString()
  filledOn!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  litres!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPaise!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;
}
