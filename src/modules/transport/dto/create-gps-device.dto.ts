import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGpsDeviceDto {
  @IsString()
  @MinLength(1)
  deviceUid!: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsString()
  @MinLength(1)
  authSecretRef!: string;

  @IsOptional()
  @IsString()
  firmware?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'FAULTY', 'RETIRED'])
  status?: string;
}
