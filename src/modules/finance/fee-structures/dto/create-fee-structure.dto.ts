import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { FeeStructureLineDto } from './fee-structure-line.dto';

export class CreateFeeStructureDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  gradeId!: string;

  @IsOptional()
  @IsUUID()
  mediumId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureLineDto)
  lines!: FeeStructureLineDto[];
}
