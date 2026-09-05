import { IsString, MinLength } from 'class-validator';

export class TransferInventoryItemDto {
  @IsString()
  @MinLength(1)
  location!: string;
}
