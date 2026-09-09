import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class IssueInventoryItemDto {
  @IsUUID()
  assignedToPersonId!: string;

  @IsOptional()
  @IsDateString()
  assignedOn?: string;
}
