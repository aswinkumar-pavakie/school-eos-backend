import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const TRIP_STATES = [
  'SCHEDULED',
  'STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'INTERRUPTED',
  'CANCELLED',
];

export class TripsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsIn(TRIP_STATES)
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Capped at 500, not 100 -- the Reports page aggregates a full date range
  // in one call (this environment's whole trip table is ~180 rows), and an
  // undercounted aggregate would be a dishonest total, not a paginated list.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 25;
}
