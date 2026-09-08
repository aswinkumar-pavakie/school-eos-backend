import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const HEAD_TYPES = ['TUITION', 'SPECIAL', 'TRANSPORT', 'HOSTEL', 'EXAM', 'LAB', 'LIBRARY', 'ID_CARD', 'OTHER'];

export class CreateFeeHeadDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsIn(HEAD_TYPES)
  headType!: string;

  @IsOptional()
  @IsBoolean()
  isRefundable?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
