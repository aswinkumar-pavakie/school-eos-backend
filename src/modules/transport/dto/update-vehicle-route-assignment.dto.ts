import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class UpdateVehicleRouteAssignmentDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  attendantId?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
