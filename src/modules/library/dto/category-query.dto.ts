import { IsIn, IsOptional } from 'class-validator';

export class CategoryQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
