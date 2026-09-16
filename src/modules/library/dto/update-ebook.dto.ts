import { IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class UpdateEbookDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  resourceUrl?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  coverImageUrl?: string;
}
