import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const HEAD_TYPES = ['TUITION', 'SPECIAL', 'TRANSPORT', 'HOSTEL', 'EXAM', 'LAB', 'LIBRARY', 'ID_CARD', 'OTHER'];

export class UpdateFeeHeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(HEAD_TYPES)
  headType?: string;

  @IsOptional()
  @IsBoolean()
  isRefundable?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
