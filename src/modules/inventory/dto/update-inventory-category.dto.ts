import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateInventoryCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
