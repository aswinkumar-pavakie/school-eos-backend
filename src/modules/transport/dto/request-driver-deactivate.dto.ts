import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestDriverDeactivateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
