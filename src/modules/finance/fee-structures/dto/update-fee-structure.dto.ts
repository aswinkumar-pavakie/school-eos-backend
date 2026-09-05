import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { FeeStructureLineDto } from './fee-structure-line.dto';

export class UpdateFeeStructureDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeStructureLineDto)
  lines?: FeeStructureLineDto[];
}
