import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @MinLength(1)
  registrationNo!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsIn(['OWNED', 'HIRED', 'LEASED'])
  ownership?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'GROUNDED', 'RETIRED'])
  operationalStatus?: string;
}
