import { IsNotEmpty, IsString } from 'class-validator';

// Shared by /auth/refresh and /auth/logout — both take exactly { refreshToken }.
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
