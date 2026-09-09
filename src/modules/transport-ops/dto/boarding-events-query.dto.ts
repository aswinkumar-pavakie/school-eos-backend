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

export class BoardingEventsQueryDto {
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
  tripId?: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  // Real backend-supported values only (bus_boarding_event_source_check) --
  // never a NFC-only result vocabulary that doesn't exist on this table.
  @IsOptional()
  @IsIn(['ATTENDANT_MANUAL', 'CARD_TAP'])
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Capped at 1000, not 200 -- the Reports page aggregates a full date range
  // in one call (this environment's whole boarding-event table is ~712
  // rows), and an undercounted aggregate would be a dishonest total, not a
  // paginated list.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;
}
