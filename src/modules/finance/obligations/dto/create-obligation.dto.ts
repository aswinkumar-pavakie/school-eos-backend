import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateObligationDto {
  @IsUUID()
  assignmentId!: string;

  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  feeHeadId?: string;

  @IsInt()
  @Min(1)
  instalmentNo!: number;

  @Matches(/^[0-9]+$/, {
    message: 'amountPaise must be a non-negative integer string',
  })
  amountPaise!: string;

  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'lateFeePaise must be a non-negative integer string',
  })
  lateFeePaise?: string;

  @IsISO8601({ strict: true })
  dueDate!: string;
}
