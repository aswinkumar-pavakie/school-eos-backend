import { IsOptional, IsString, MinLength } from 'class-validator';

// If newPassword is omitted, a temporary password is generated and returned once.
export class GeneralPasswordResetDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
