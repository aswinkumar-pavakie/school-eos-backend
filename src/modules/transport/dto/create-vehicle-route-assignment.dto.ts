import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateVehicleRouteAssignmentDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  routeId!: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  attendantId?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
