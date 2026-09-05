import { IsOptional, IsUUID } from 'class-validator';

export class GpsDeviceMappingQueryDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
