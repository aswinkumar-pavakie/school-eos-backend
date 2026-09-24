import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** Add a mapped account (first time on this phone): its email + password. Started from the
 * faculty side only, and only accepted if the admin mapped that class to the caller. */
export class LinkAccountDto {
  /** The class login's own email (what it signs in with). */
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  /** The class login's own password -- the second secret a leaked faculty password
   * does not give. */
  @IsString()
  @IsNotEmpty()
  password!: string;

  /** The caller's CURRENT refresh token: proves a live session on this phone. */
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsOptional()
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  devicePlatform?: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  deviceLabel?: string;
}

export class SwitchAccountDto {
  @IsUUID()
  targetPersonId!: string;

  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
