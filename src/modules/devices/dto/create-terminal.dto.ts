import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';

const TERMINAL_TYPES = ['BUS', 'CANTEEN', 'GATE', 'LIBRARY'];

export class CreateTerminalDto {
  @IsString()
  terminalUid!: string;

  @IsIn(TERMINAL_TYPES)
  terminalType!: string;

  @IsString()
  label!: string;

  @ValidateIf((o) => o.terminalType === 'BUS')
  @IsUUID()
  vehicleId?: string;

  @ValidateIf((o) => o.terminalType === 'CANTEEN')
  @IsUUID()
  vendorId?: string;

  @IsString()
  authSecretRef!: string;

  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  offlineFloorPaise?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'OFFLINE', 'FAULTY', 'RETIRED'])
  status?: string;
}
