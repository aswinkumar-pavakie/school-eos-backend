import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateSportsProfileDto {
  @IsOptional()
  @IsUUID()
  sportCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  positionOrRole?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
