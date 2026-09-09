import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Shared by both Bus Tracking and Boarding Monitor -- both are "pick a bus,
// pick a date" screens, per the product requirement's mandatory Bus filter.
export class TransportOpsQueryDto {
  @IsUUID()
  vehicleId!: string;

  // Defaults to today (server-side, in the service) if omitted.
  @IsOptional()
  @IsDateString()
  date?: string;
}
