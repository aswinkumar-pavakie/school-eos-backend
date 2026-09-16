import { IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

// No file upload -- an eBook is a real external link (resourceUrl), exactly
// how a real school library's own eResources list works: clicking one opens
// the official resource, this app never stores the content itself.
export class CreateEbookDto {
  @IsString()
  title!: string;

  @IsUrl({ require_protocol: true })
  resourceUrl!: string;

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
