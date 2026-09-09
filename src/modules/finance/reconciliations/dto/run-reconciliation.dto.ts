import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, Matches, ValidateNested } from 'class-validator';

export class SettlementRowDto {
  @IsString()
  @IsNotEmpty()
  gatewayRef!: string;

  @Matches(/^[1-9][0-9]*$/, { message: 'amountPaise must be a positive integer string' })
  amountPaise!: string;
}

// No object-storage/file-parsing service exists yet in this codebase (same gap as
// Bulk Import) — the settlement file's rows are sent inline here rather than read back
// from settlementObjectKey. See Finance README's assumptions section.
export class RunReconciliationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettlementRowDto)
  settlementRows!: SettlementRowDto[];
}
