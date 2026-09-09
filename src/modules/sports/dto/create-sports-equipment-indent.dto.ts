import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

// Deliberately its own DTO, not a reuse of Finance's generic CreatePurchaseRequestDto
// — Sports always requests against ONE specific equipment row (so restocking can
// auto-increment it on delivery), which the generic Admin/Media flows don't need.
export class CreateSportsEquipmentIndentDto {
  @IsUUID()
  equipmentId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  vendorName?: string;
}
