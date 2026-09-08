import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AssignRepairRequestDto {
  @IsUUID()
  assignedToPersonId!: string;

  @IsOptional()
  @IsDateString()
  assignedOn?: string;
}
