import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// General audit trail query -- unlike AuditEventQueryDto (audit-events.controller.ts,
// hard-scoped to LOGIN_SUCCESS/LOGIN_FAILURE for the login-activity screen), this
// exposes every column AuditService.query() already supports, for the real Settings
// > Audit Log screen (Design Architecture v0.1 module 20).
export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  actorPersonId?: string;

  @IsOptional()
  @IsString()
  objectType?: string;

  @IsOptional()
  @IsString()
  objectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
