import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTerminalDto {
  @IsOptional()
  @IsString()
  label?: string;

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
