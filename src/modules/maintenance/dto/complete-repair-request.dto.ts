import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CompleteRepairRequestDto {
  @IsOptional()
  @IsDateString()
  completedOn?: string;

  @IsOptional()
  @IsString()
  repairAction?: string;

  @IsOptional()
  @IsString()
  completionNotes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPaise?: number;
}
