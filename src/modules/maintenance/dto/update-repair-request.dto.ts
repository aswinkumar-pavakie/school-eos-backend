import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// Plain field edit only -- never status/assignment/completion, which each have
// their own dedicated action endpoint (see RepairRequestsController).
export class UpdateRepairRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

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

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;
}
