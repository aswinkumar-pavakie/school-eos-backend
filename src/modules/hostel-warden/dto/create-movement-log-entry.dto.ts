import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MOVEMENT_LOG_PURPOSES } from '../repositories/outing-request.repository';

// The design's own "Record an exit" form -- the Warden fills this in while
// the parent is on the phone; see outing-request.repository.ts's own
// createDirect comment for why this creates an already-APPROVED record
// with no separate decision step.
export class CreateMovementLogEntryDto {
  @IsUUID()
  studentId!: string;

  @IsIn(MOVEMENT_LOG_PURPOSES)
  purposeCategory!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  calledByName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  calledByPhone!: string;

  @IsDateString()
  outFrom!: string;

  @IsDateString()
  expectedReturn!: string;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}
