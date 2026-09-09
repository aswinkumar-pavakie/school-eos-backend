import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrderStageDto {
  @IsIn([
    'ORDERED',
    'DISPATCHED',
    'IN_TRANSIT',
    'DELIVERED',
    'PART_DELIVERED',
    'CANCELLED',
  ])
  stage!:
    | 'ORDERED'
    | 'DISPATCHED'
    | 'IN_TRANSIT'
    | 'DELIVERED'
    | 'PART_DELIVERED'
    | 'CANCELLED';

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityDelivered?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AllotOrderDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
