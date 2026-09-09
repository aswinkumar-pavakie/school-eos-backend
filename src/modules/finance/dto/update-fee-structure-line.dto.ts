import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateFeeStructureLineDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  amountPaise?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateFeePaise?: number;
}
