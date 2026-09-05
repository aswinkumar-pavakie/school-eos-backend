import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRepairRequestDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsOptional()
  @IsIn(['ELECTRICAL', 'PLUMBING', 'CIVIL', 'IT_EQUIPMENT', 'FURNITURE', 'OTHER'])
  issueType?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsDateString()
  requestedOn?: string;
}
