import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFoodOrderDto {
  @IsString()
  @MinLength(2)
  items!: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
