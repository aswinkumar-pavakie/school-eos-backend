import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListMessagingUsersQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  excludePersonId?: string;
}

// Kept separate from the query DTO purely for documentation clarity — the
// route param itself is validated by ParseUUIDPipe at the controller.
export const DEFAULT_LIST_LIMIT = 30;
