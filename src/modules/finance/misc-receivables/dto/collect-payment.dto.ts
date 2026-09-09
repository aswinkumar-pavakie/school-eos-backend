import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CollectPaymentDto {
  @IsInt()
  @Min(1)
  amountPaise!: number;

  @IsIn(['CASH', 'CHEQUE', 'DD', 'ONLINE'])
  mode!: 'CASH' | 'CHEQUE' | 'DD' | 'ONLINE';

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
