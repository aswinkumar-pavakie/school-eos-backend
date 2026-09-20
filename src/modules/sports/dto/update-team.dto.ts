import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const TEAM_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  sportCategoryId?: string;

  @IsOptional()
  @IsUUID()
  captainStudentId?: string;

  @IsOptional()
  @IsUUID()
  houseId?: string;

  // Real soft-delete path -- team has no hard-delete endpoint (rosters,
  // fixtures and sessions reference it), so "Delete" in the UI sets this to
  // INACTIVE instead.
  @IsOptional()
  @IsIn(TEAM_STATUSES)
  status?: (typeof TEAM_STATUSES)[number];
}
