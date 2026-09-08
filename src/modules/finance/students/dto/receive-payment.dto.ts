import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class ReceivePaymentDto {
  @IsUUID()
  feeDemandId!: string;

  @Matches(/^[1-9][0-9]*$/, {
    message: 'amountPaise must be a positive integer string',
  })
  amountPaise!: string;

  @IsIn(['CASH', 'CHEQUE', 'DD'])
  mode!: 'CASH' | 'CHEQUE' | 'DD';

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ValidateIf((o) => o.mode === 'DD')
  @IsString()
  @IsNotEmpty()
  bankName?: string;

  @ValidateIf((o) => o.mode === 'DD')
  @IsString()
  @IsNotEmpty()
  ddReferenceNo?: string;
}
