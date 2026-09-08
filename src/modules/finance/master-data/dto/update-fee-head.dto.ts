import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { FEE_HEAD_TYPES } from './create-fee-head.dto';

export class UpdateFeeHeadDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsIn(FEE_HEAD_TYPES)
  headType?: (typeof FEE_HEAD_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isRefundable?: boolean;
}
