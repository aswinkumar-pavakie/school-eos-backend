import { IsIn, IsOptional, IsString } from 'class-validator';

export class DocumentQueryDto {
  @IsOptional()
  @IsString()
  ownerObjectType?: string;

  @IsOptional()
  @IsString()
  ownerObjectId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUPERSEDED', 'EXPIRED', 'PURGED'])
  status?: string;
}
