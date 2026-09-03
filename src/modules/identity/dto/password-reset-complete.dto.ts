import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class PasswordResetCompleteDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
