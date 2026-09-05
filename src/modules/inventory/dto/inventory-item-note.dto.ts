import { IsOptional, IsString } from 'class-validator';

// Shared by markDamaged/markLost/retire -- each just needs an optional reason,
// recorded on the audit trail rather than a dedicated column.
export class InventoryItemNoteDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
