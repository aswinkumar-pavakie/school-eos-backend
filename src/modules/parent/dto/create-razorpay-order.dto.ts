import { ArrayMinSize, IsArray, IsInt, IsUUID, Matches, Min } from 'class-validator';

export class CreateRazorpayOrderDto {
  @IsUUID()
  academicYearId!: string;

  @IsInt()
  @Min(1)
  instalmentNo!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  feeDemandIds!: string[];

  // The amount the parent chose to pay now — may be less than the full outstanding
  // balance across the selected lines (a genuine partial payment; fee_demand.state
  // already models PARTIAL as a real, first-class state).
  @Matches(/^[1-9][0-9]*$/, { message: 'amountPaise must be a positive integer string' })
  amountPaise!: string;
}
