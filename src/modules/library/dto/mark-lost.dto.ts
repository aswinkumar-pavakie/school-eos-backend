import { IsOptional, IsString } from 'class-validator';

export class MarkLostDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
