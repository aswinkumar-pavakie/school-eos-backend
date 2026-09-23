import { IsDateString, IsOptional } from 'class-validator';

export class CanteenReportsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
