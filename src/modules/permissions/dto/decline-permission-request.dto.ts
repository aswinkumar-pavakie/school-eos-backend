import { IsOptional, IsString, MaxLength } from 'class-validator';

// Reason is optional -- nothing in the approved product rules requires it.
export class DeclinePermissionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
