import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateGpsDeviceMappingDto {
  @IsUUID()
  deviceId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsDateString()
  mappedFrom!: string;

  @IsOptional()
  @IsDateString()
  mappedTo?: string;
}
