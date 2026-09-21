import {
  IsBoolean,
  IsDateString,
  IsOptional,
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

  // Was missing here even though the sibling CreateGatePassRequestDto has it
  // and ParentHostelRequestsService.createOutingRequest already threads it
  // straight through to outing_request.is_overnight -- confirmed live via a
  // full-action test: this field was silently rejected by the global
  // ValidationPipe's forbidNonWhitelisted rule, meaning an overnight
  // emergency exit could never be recorded as such, which also fed a wrong
  // "Away"/"Past due date" status into the real Leave register (both the
  // website's and the mobile app's own leave/page derive it from exactly
  // this flag).
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}
