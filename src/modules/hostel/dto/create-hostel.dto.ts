import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHostelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  gender!: string;

  @IsOptional()
  @IsUUID()
  wardenStaffId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
