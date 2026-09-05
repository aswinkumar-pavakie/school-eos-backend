import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class VehicleRouteAssignmentQueryDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  currentOnly?: boolean;
}
