import { IsIn, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateMediaPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  caption?: string;

  @IsOptional()
  @IsString()
  firstComment?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  linkUrl?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  pinToTop?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  allowComments?: string;
}
