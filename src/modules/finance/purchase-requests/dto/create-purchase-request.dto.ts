import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreatePurchaseRequestDto {
  @IsIn(['GOODS', 'SERVICE'])
  requestType!: 'GOODS' | 'SERVICE';

  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @Matches(/^[1-9][0-9]*$/, {
    message: 'estimatedAmountPaise must be a positive integer string',
  })
  estimatedAmountPaise?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  neededBy?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
