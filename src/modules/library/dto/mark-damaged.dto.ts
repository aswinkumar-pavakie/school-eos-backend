import { IsOptional, IsString } from 'class-validator';

export class MarkDamagedDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
