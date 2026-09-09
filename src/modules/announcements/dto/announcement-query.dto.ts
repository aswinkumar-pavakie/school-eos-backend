import { IsIn, IsOptional, IsString } from 'class-validator';

export class AnnouncementQueryDto {
  // A real role_code (PARENT, FACULTY, FINANCE, PRINCIPAL, ADMIN, ...) -- returns
  // announcements sent to the whole school OR specifically to this role.
  @IsOptional()
  @IsString()
  roleCode?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: string;
}
