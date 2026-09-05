import { IsDateString, IsOptional } from 'class-validator';

export class UpdateGpsDeviceMappingDto {
  @IsOptional()
  @IsDateString()
  mappedFrom?: string;

  @IsOptional()
  @IsDateString()
  mappedTo?: string;
}
