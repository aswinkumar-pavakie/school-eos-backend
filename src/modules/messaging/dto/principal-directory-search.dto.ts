import { IsOptional, IsString } from 'class-validator';

// Search-only -- deliberately narrower than StaffQueryDto/StudentQueryDto (no
// status/ids/pagination-tuning params exposed here). This is a messaging
// picker, not the Admin directory: Principal gets exactly enough to find who to
// message, not the full Admin staff/student management surface.
export class PrincipalDirectorySearchDto {
  @IsOptional()
  @IsString()
  search?: string;
}
