import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportRowDto {
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

export class ImportRowsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}
