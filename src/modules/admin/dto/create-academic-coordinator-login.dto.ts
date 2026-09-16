import { IsIn, IsString, MinLength } from 'class-validator';

export class CreateAcademicCoordinatorLoginDto {
  @IsIn(['EMAIL', 'MOBILE'])
  identifierType!: 'EMAIL' | 'MOBILE';

  @IsString()
  identifierValue!: string;

  // Admin sets this coordinator login's initial password directly (same
  // "Admin types it in themselves" posture as every Create User flow in
  // this app -- no separate verification step, no temp-password email).
  @IsString()
  @MinLength(8)
  password!: string;
}
