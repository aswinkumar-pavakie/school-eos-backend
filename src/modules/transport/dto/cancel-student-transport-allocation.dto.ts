import { IsDateString, IsOptional } from 'class-validator';

export class CancelStudentTransportAllocationDto {
  @IsOptional()
  @IsDateString()
  validTo?: string;
}
