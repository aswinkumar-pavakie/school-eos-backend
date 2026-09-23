import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStationeryOrderDto {
  @IsString()
  @MinLength(2)
  items!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
