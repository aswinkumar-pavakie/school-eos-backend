import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class AllocationLineDto {
  @IsUUID()
  feeDemandId!: string;

  @Matches(/^[1-9][0-9]*$/, {
    message: 'amountPaise must be a positive integer string',
  })
  amountPaise!: string;
}

export class AllocatePaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationLineDto)
  allocations!: AllocationLineDto[];
}
