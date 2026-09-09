import { IsDateString, IsOptional } from 'class-validator';

// Fleet-wide tracking has no per-bus filter (that's the single-vehicle
// endpoint) -- date only, defaulting to today server-side same as the
// single-vehicle endpoint.
export class FleetTrackingQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
