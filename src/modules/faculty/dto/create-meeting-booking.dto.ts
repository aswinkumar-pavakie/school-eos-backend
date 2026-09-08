import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMeetingBookingDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
