import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class PaymentQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'RECONCILED', 'REVERSED'])
  state?: string;

  @IsOptional()
  @IsIn(['UPI', 'CARD', 'NETBANKING', 'CASH', 'CHEQUE', 'DD', 'WALLET_TOPUP'])
  mode?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
