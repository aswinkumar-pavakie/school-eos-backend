import { IsNotEmpty, IsString } from 'class-validator';

export class PasswordResetRequestDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;
}
