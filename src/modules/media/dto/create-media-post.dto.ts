import { IsIn, IsISO8601, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

// multipart/form-data alongside the files (see media-posts.controller.ts) --
// booleans arrive as the strings "true"/"false", same convention
// documents.service.ts's isRestricted already uses.
export class CreateMediaPostDto {
  @IsIn(['POST', 'PHOTO_CAROUSEL', 'VIDEO', 'ANNOUNCEMENT_CARD'])
  format!: string;

  @IsIn(['EVENT', 'ACADEMIC', 'DEPARTMENT', 'GENERAL'])
  category!: string;

  @IsString()
  @MinLength(1)
  caption!: string;

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

  // Publish immediately (omit) or schedule for later (ISO datetime, must be in the
  // future -- validated in the service, where "now" can be checked meaningfully).
  @IsOptional()
  @IsISO8601()
  publishAt?: string;

  // "Save draft" button vs "Publish now"/"Schedule" -- explicit, not inferred from
  // publishAt's presence, so a draft can still carry a tentative publish date
  // without actually being scheduled yet.
  @IsOptional()
  @IsIn(['true', 'false'])
  saveAsDraft?: string;
}
