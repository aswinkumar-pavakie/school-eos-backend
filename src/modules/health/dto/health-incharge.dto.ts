// Request shapes for the Health In-charge console (POST/PUT/PATCH bodies + the two
// list filters that aren't shared with the read-only oversight endpoints).

import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const VISIT_ACTIONS = ['REST', 'MEDICATION', 'SENT_HOME', 'REFERRED', 'SICKBAY_ADMIT', 'NO_ACTION'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const ESCALATION_CHANNELS = ['PHONE', 'SMS', 'WHATSAPP', 'APP', 'IN_PERSON'] as const;

/** Stored as jsonb; keys follow what the existing 800 visits already use (pulse, temp_c). */
export class VitalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(34)
  @Max(43)
  temp_c?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(250)
  pulse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100)
  spo2?: number;

  /** e.g. "110/70" */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}\/\d{2,3}$/, { message: 'bp must look like 110/70' })
  bp?: string;
}

export class CreateInfirmaryVisitDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  complaint!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;

  @IsIn(VISIT_ACTIONS as unknown as string[])
  action!: (typeof VISIT_ACTIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outcome?: string;

  /** Tell the student's guardians now. Defaults to true for SENT_HOME / REFERRED /
   * SICKBAY_ADMIT (the serious ones), false otherwise. */
  @IsOptional()
  @IsBoolean()
  notifyParent?: boolean;
}

export class UpdateInfirmaryVisitDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outcome?: string;

  @IsOptional()
  @IsIn(VISIT_ACTIONS as unknown as string[])
  action?: (typeof VISIT_ACTIONS)[number];
}

/** PUT = the form's full set of fields; an empty/absent value clears that field. */
export class UpsertHealthProfileDto {
  @IsOptional()
  @IsIn(BLOOD_GROUPS as unknown as string[])
  bloodGroup?: (typeof BLOOD_GROUPS)[number] | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(250)
  heightCm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(250)
  weightKg?: number | null;

  @IsOptional()
  @IsDateString()
  measuredOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  familyDoctor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  doctorPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  insuranceRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class CreateEscalationDto {
  /** The infirmary visit this contact is about. */
  @IsUUID()
  visitId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactedName!: string;

  @IsIn(ESCALATION_CHANNELS as unknown as string[])
  channel!: (typeof ESCALATION_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  response?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  outcome?: string;
}

export class StudentSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class VisitListQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsIn(VISIT_ACTIONS as unknown as string[])
  action?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** Only serious visits whose guardians have not been told yet. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsParentNotice?: boolean;
}

export class AlertListQueryDto {
  /** 'open' | 'done' | undefined (all) */
  @IsOptional()
  @IsIn(['open', 'done'])
  status?: 'open' | 'done';
}
