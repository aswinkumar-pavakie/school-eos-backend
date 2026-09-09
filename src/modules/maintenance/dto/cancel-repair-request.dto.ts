import { IsOptional, IsString } from 'class-validator';

export class CancelRepairRequestDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
