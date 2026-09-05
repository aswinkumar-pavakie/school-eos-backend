import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateFeeStructureLineDto {
  @IsUUID()
  feeHeadId!: string;

  @IsInt()
  @Min(0)
  amountPaise!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  instalmentNo?: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateFeePaise?: number;
}
