import { IsOptional, IsString, MinLength } from 'class-validator';

// newPassword is optional: if omitted, the server generates a temporary password and
// returns it once in the response. If supplied, the admin sets it explicitly instead.
export class AdminPasswordResetDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
