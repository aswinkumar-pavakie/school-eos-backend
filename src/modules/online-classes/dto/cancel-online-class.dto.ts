import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOnlineClassDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
