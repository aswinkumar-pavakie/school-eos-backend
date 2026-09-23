import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMedicalAppointmentDto {
  @IsDateString()
  preferredDate!: string;

  @IsOptional()
  @IsString()
  preferredTime?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
