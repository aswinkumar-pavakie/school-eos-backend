import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestRouteDeactivateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
