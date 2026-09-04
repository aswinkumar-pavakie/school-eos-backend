import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type DevicePlatform = 'WEB' | 'ANDROID' | 'IOS';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  // Not in the exact response contract, but user_session.device_platform is NOT NULL
  // with a WEB/ANDROID/IOS check constraint — this lets a client identify itself;
  // defaults to WEB when omitted (see IdentityService).
  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  devicePlatform?: DevicePlatform;

  @IsOptional()
  @IsString()
  deviceLabel?: string;
}
