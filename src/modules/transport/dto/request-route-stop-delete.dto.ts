import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestRouteStopDeleteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
