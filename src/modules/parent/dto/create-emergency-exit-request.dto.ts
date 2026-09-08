import {
  IsDateString,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmergencyExitRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  outFrom!: string;

  // Still required, even for a genuine emergency -- the parent gives their best
  // estimate; the Warden sees and can act on it as-is (see the Hostel Warden
  // module plan's Emergency Exit modeling decision).
  @IsDateString()
  expectedReturn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
