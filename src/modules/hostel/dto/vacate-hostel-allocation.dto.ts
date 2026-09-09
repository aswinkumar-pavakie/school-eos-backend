import { IsDateString, IsOptional } from 'class-validator';

export class VacateHostelAllocationDto {
  @IsOptional()
  @IsDateString()
  allocatedTo?: string;
}
