import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class MarkEntryDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  marksObtained?: number;

  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;
}

export class SaveMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];
}
