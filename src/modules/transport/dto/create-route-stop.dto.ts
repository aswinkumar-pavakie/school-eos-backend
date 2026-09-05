import { Type } from 'class-transformer';
import { IsInt, IsMilitaryTime, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateRouteStopDto {
  @IsString()
  @MinLength(1)
  stopName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequenceNo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsMilitaryTime()
  scheduledTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  geofenceRadiusM?: number;
}
