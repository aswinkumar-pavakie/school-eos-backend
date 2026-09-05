import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateInventoryCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
